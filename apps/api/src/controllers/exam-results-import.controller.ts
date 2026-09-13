import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';
import { parseBooleanCell, parseExamResultsWorkbook, parseNumberCell, SpreadsheetValidationError } from '../security/spreadsheet-security';
import { getEligibleExamStudents } from '../services/exam-eligibility.service';

type ImportError = { row: number; column: string; code: string };
const validationMessages: Record<string, string> = {
  RAW_XLSX_REQUIRED: 'يجب رفع ملف Excel بصيغة XLSX.',
  INVALID_MIME: 'نوع الملف غير مدعوم. استخدم ملف XLSX.',
  FILE_TOO_LARGE: 'حجم ملف Excel يتجاوز الحد المسموح وهو 10 ميجابايت.',
  MALFORMED_XLSX: 'ملف Excel تالف أو غير صالح.',
  EMPTY_SHEET: 'ملف Excel لا يحتوي على بيانات قابلة للاستيراد.',
  REQUIRED_COLUMNS: 'ملف Excel لا يطابق قالب نتائج الامتحان.',
  QUESTION_COLUMNS: 'ملف Excel لا يحتوي على أعمدة أسئلة صالحة.',
  QUESTION_NOT_IN_EXAM: 'تعذر العثور على السؤال ضمن هذا الامتحان.',
  DUPLICATE_QUESTION_COLUMN: 'يوجد عمود مكرر للسؤال نفسه.',
  STUDENT_NOT_ELIGIBLE: 'تعذر العثور على الطالب ضمن طلاب هذا الامتحان.',
  DUPLICATE_ROW: 'يوجد أكثر من صف للطالب نفسه.',
  INVALID_ABSENCE: 'قيمة الغياب غير صالحة.',
  INVALID_QUESTION_SCORE: 'درجة السؤال غير صالحة أو تتجاوز الدرجة القصوى.',
  ABSENT_CANNOT_HAVE_SCORE: 'لا يمكن تسجيل درجات لطالب محدد كغائب.',
  INVALID_TOTAL_SCORE: 'مجموع درجات الأسئلة يتجاوز درجة الامتحان القصوى.',
};
const uuid = (value: unknown): string | null => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? String(value) : null;

const validationResponse = (res: Response, errors: ImportError[]) => res.status(400).json({
  code: 'SPREADSHEET_VALIDATION_FAILED',
  message: 'تعذر استيراد الملف. راجع الأخطاء الموضحة وحاول مرة أخرى.',
  totalErrors: errors.length,
  errors: errors.slice(0, 100).map(error => ({ ...error, message: validationMessages[error.code] || 'قيمة غير صالحة في ملف Excel.' })),
});

export async function importExamResults(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const academicYearId = req.context?.academicYearId || '';
  const examId = uuid(req.params.id);
  if (!examId || !institutionId) return res.status(404).json({ error: 'Exam not found.' });
  if (!Buffer.isBuffer(req.body)) return validationResponse(res, [{ row: 0, column: '', code: 'RAW_XLSX_REQUIRED' }]);

  const exam = await prisma.exam.findFirst({ where: { id: examId, institutionId, academicYearId, archivedAt: null }, select: { id: true, maxScore: true, subjectId: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });

  let rows: Array<Record<string, string>>;
  try { rows = await parseExamResultsWorkbook(req.body, String(req.headers['content-type'] || '')); }
  catch (error) {
    if (error instanceof SpreadsheetValidationError) return validationResponse(res, error.errors);
    return validationResponse(res, [{ row: 0, column: '', code: 'MALFORMED_XLSX' }]);
  }

  const questions = await prisma.examQuestion.findMany({ where: { examId: exam.id, institutionId }, select: { id: true, questionNumber: true, maxScore: true } });
  const questionByNumber = new Map(questions.map(question => [String(question.questionNumber), question]));
  const questionById = new Map(questions.map(question => [question.id.replace(/-/g, '').toLowerCase(), question]));
  const eligibleStudentIds = new Set((await getEligibleExamStudents({ ...exam, institutionId, academicYearId })).map(item => item.studentId));
  const students = await prisma.student.findMany({ where: { institutionId, id: { in: [...eligibleStudentIds] } }, select: { id: true, nationalId: true } });
  const studentByNationalId = new Map(students.map(student => [String(student.nationalId || '').replace(/[\s-]+/g, ''), student]));
  const errors: ImportError[] = [];
  const normalized: Array<{ row: number; studentId: string; absent: boolean; scores: Array<{ questionId: string; score: number | null }>; absenceReason: string | null; notes: string | null }> = [];
  const seen = new Set<string>();

  for (const item of rows) {
    const row = Number(item.__row || 0);
    const nationalId = String(item.nationalId || '').replace(/[\s-]+/g, '');
    const student = studentByNationalId.get(nationalId);
    if (!student) { errors.push({ row, column: 'nationalId', code: 'STUDENT_NOT_ELIGIBLE' }); continue; }
    if (seen.has(student.id)) { errors.push({ row, column: 'nationalId', code: 'DUPLICATE_ROW' }); continue; }
    seen.add(student.id);
    const absent = parseBooleanCell(item.isAbsence);
    if (absent === null) { errors.push({ row, column: 'isAbsence', code: 'INVALID_ABSENCE' }); continue; }
    const scores: Array<{ questionId: string; score: number | null }> = [];
    const seenQuestions = new Set<string>();
    let total = 0;
    for (const [header, value] of Object.entries(item)) {
      if (!header.startsWith('question')) continue;
      const match = header.match(/^question(\d+)([0-9a-f]{32})?$/i);
      const question = match?.[2] ? questionById.get(match[2].toLowerCase()) : match?.[1] ? questionByNumber.get(match[1]) : undefined;
      if (!question) { errors.push({ row, column: header, code: 'QUESTION_NOT_IN_EXAM' }); continue; }
      if (seenQuestions.has(question.id)) { errors.push({ row, column: header, code: 'DUPLICATE_QUESTION_COLUMN' }); continue; }
      seenQuestions.add(question.id);
      const score = parseNumberCell(value);
      if (String(value || '').trim() && score === null) errors.push({ row, column: header, code: 'INVALID_QUESTION_SCORE' });
      if (score !== null && (score < 0 || score > Number(question.maxScore))) errors.push({ row, column: header, code: 'INVALID_QUESTION_SCORE' });
      if (score !== null) total += score;
      scores.push({ questionId: question.id, score });
    }
    if (absent && total > 0) errors.push({ row, column: 'isAbsence', code: 'ABSENT_CANNOT_HAVE_SCORE' });
    if (!absent && total > Number(exam.maxScore)) errors.push({ row, column: 'total', code: 'INVALID_TOTAL_SCORE' });
    normalized.push({ row, studentId: student.id, absent, scores, absenceReason: item.absenceReason || null, notes: item.notes || null });
  }
  if (errors.length) return validationResponse(res, errors);

  const existingResults = await prisma.studentExamResult.findMany({
    where: { institutionId, examId: exam.id, studentId: { in: normalized.map(item => item.studentId) } },
    select: { studentId: true },
  });
  const existingStudentIds = new Set(existingResults.map(item => item.studentId));
  const createdCount = normalized.filter(item => !existingStudentIds.has(item.studentId)).length;
  const updatedCount = normalized.length - createdCount;
  await prisma.$transaction(async tx => {
    const now = new Date();
    if (normalized.length) {
      const resultRows = normalized.map(item => Prisma.sql`(
        ${randomUUID()}::uuid, ${institutionId}::uuid, ${exam.id}::uuid, ${item.studentId}::uuid,
        ${item.absent ? 0 : item.scores.reduce((sum, score) => sum + (score.score || 0), 0)},
        ${item.absent}, ${item.absent ? item.absenceReason : null}, ${item.notes}, ${now}, ${now}
      )`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "student_exam_results"
          ("id", "institutionId", "examId", "studentId", "totalScore", "isAbsence", "absenceReason", "notes", "createdAt", "updatedAt")
        VALUES ${Prisma.join(resultRows)}
        ON CONFLICT ("examId", "studentId") DO UPDATE SET
          "totalScore" = EXCLUDED."totalScore",
          "isAbsence" = EXCLUDED."isAbsence",
          "absenceReason" = EXCLUDED."absenceReason",
          "notes" = EXCLUDED."notes",
          "updatedAt" = EXCLUDED."updatedAt"
      `);
    }

    const scoreDeletes = normalized.flatMap(item => item.absent
      ? questions.map(question => ({ studentId: item.studentId, questionId: question.id }))
      : item.scores.filter(score => score.score === null).map(score => ({ studentId: item.studentId, questionId: score.questionId })));
    if (scoreDeletes.length) {
      const pairs = scoreDeletes.map(item => Prisma.sql`(${item.studentId}::uuid, ${item.questionId}::uuid)`);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "student_question_scores"
        WHERE "institutionId" = ${institutionId}::uuid
          AND ("studentId", "examQuestionId") IN (${Prisma.join(pairs)})
      `);
    }

    const scoreWrites = normalized.flatMap(item => item.absent ? [] : item.scores
      .filter((score): score is { questionId: string; score: number } => score.score !== null)
      .map(score => ({ studentId: item.studentId, ...score })));
    if (scoreWrites.length) {
      const scoreRows = scoreWrites.map(item => Prisma.sql`(
        ${randomUUID()}::uuid, ${institutionId}::uuid, ${item.questionId}::uuid, ${item.studentId}::uuid,
        ${item.score}, ${now}, ${now}
      )`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "student_question_scores"
          ("id", "institutionId", "examQuestionId", "studentId", "score", "createdAt", "updatedAt")
        VALUES ${Prisma.join(scoreRows)}
        ON CONFLICT ("examQuestionId", "studentId") DO UPDATE SET
          "score" = EXCLUDED."score",
          "updatedAt" = EXCLUDED."updatedAt"
      `);
    }
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'EXAM_RESULTS_IMPORTED', entityType: 'ExamResult', entityId: exam.id, metadata: { examId: exam.id, rowCount: normalized.length, createdCount, updatedCount } });
  });
  return res.json({ success: true, rowCount: normalized.length, createdCount, updatedCount });
}
