import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';
import { parseBooleanCell, parseExamResultsWorkbook, parseNumberCell, SpreadsheetValidationError } from '../security/spreadsheet-security';

type ImportError = { row: number; column: string; code: string };
const uuid = (value: unknown): string | null => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? String(value) : null;

const validationResponse = (res: Response, errors: ImportError[]) => res.status(400).json({
  code: 'SPREADSHEET_VALIDATION_FAILED',
  totalErrors: errors.length,
  errors: errors.slice(0, 100),
});

export async function importExamResults(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const academicYearId = req.context?.academicYearId || '';
  const examId = uuid(req.params.id);
  if (!examId || !institutionId) return res.status(404).json({ error: 'Exam not found.' });
  if (!Buffer.isBuffer(req.body)) return validationResponse(res, [{ row: 0, column: '', code: 'RAW_XLSX_REQUIRED' }]);

  const exam = await prisma.exam.findFirst({ where: { id: examId, institutionId, academicYearId, archivedAt: null }, select: { id: true, maxScore: true } });
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
  const memberships = await prisma.examStudyGroup.findMany({
    where: { examId: exam.id, institutionId },
    select: { studyGroup: { select: { students: { select: { studentEnrollment: { select: { studentId: true } } } } } } },
  });
  const eligibleStudentIds = new Set(memberships.flatMap(link => link.studyGroup.students.map(item => item.studentEnrollment.studentId)));
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
    let total = 0;
    for (const [header, value] of Object.entries(item)) {
      if (!header.startsWith('question')) continue;
      const match = header.match(/^question(\d+)([0-9a-f]{32})?$/i);
      const question = match?.[2] ? questionById.get(match[2].toLowerCase()) : match?.[1] ? questionByNumber.get(match[1]) : undefined;
      if (!question) { errors.push({ row, column: header, code: 'QUESTION_NOT_IN_EXAM' }); continue; }
      const score = parseNumberCell(value);
      if (score !== null && (score < 0 || score > Number(question.maxScore))) errors.push({ row, column: header, code: 'INVALID_QUESTION_SCORE' });
      if (score !== null) total += score;
      scores.push({ questionId: question.id, score });
    }
    if (absent && total > 0) errors.push({ row, column: 'isAbsence', code: 'ABSENT_CANNOT_HAVE_SCORE' });
    if (!absent && total > Number(exam.maxScore)) errors.push({ row, column: 'total', code: 'INVALID_TOTAL_SCORE' });
    normalized.push({ row, studentId: student.id, absent, scores, absenceReason: item.absenceReason || null, notes: item.notes || null });
  }
  if (errors.length) return validationResponse(res, errors);

  let createdCount = 0;
  let updatedCount = 0;
  await prisma.$transaction(async tx => {
    for (const item of normalized) {
      const totalScore = item.absent ? 0 : item.scores.reduce((sum, score) => sum + (score.score || 0), 0);
      const existing = await tx.studentExamResult.findFirst({ where: { examId: exam.id, studentId: item.studentId, institutionId } });
      const data = { totalScore, isAbsence: item.absent, absenceReason: item.absent ? item.absenceReason : null, notes: item.notes, updatedAt: new Date() };
      if (existing) { await tx.studentExamResult.update({ where: { id: existing.id }, data }); updatedCount += 1; }
      else { await tx.studentExamResult.create({ data: { institutionId, examId: exam.id, studentId: item.studentId, ...data } }); createdCount += 1; }
      if (item.absent) await tx.studentQuestionScore.deleteMany({ where: { institutionId, studentId: item.studentId, examQuestionId: { in: questions.map(question => question.id) } } });
      else for (const score of item.scores) {
        if (score.score === null) await tx.studentQuestionScore.deleteMany({ where: { institutionId, studentId: item.studentId, examQuestionId: score.questionId } });
        else await tx.studentQuestionScore.upsert({ where: { examQuestionId_studentId: { examQuestionId: score.questionId, studentId: item.studentId } }, update: { score: score.score, updatedAt: new Date() }, create: { institutionId, studentId: item.studentId, examQuestionId: score.questionId, score: score.score } });
      }
    }
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'EXAM_RESULTS_IMPORTED', entityType: 'ExamResult', entityId: exam.id, metadata: { examId: exam.id, rowCount: normalized.length, createdCount, updatedCount } });
  });
  return res.json({ success: true, rowCount: normalized.length, createdCount, updatedCount });
}
