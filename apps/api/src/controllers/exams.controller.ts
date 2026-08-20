import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';

const uuid = (value: unknown): string | null => { const text = String(value || ''); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null; };
const context = (req: ContextRequest) => ({ institutionId: req.context?.institutionId || '', academicYearId: req.context?.academicYearId || '' });

async function examRelations(req: ContextRequest, body: any) {
  const { institutionId, academicYearId } = context(req);
  const academicPeriodId = uuid(body.academicPeriodId);
  const subjectId = uuid(body.subjectId);
  const examTypeId = uuid(body.examTypeId);
  if (!academicPeriodId || !subjectId || !examTypeId) return null;
  const [period, subject, examType] = await Promise.all([
    prisma.academicPeriod.findFirst({ where: { id: academicPeriodId, institutionId, academicYearId, isActive: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true } }),
    prisma.examType.findFirst({ where: { id: examTypeId, institutionId, isActive: true } }),
  ]);
  return { period, subject, examType };
}

export async function getExams(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const exams = await prisma.exam.findMany({ where: { institutionId, academicYearId, archivedAt: null }, include: { subject: { select: { id: true, nameAr: true, nameHe: true } }, academicPeriod: { select: { id: true, nameAr: true, startDate: true, endDate: true } }, examType: { select: { id: true, nameAr: true, nameHe: true } }, _count: { select: { studentExamResults: true, examQuestions: true, examGroups: true } } }, orderBy: [{ examDate: 'asc' }, { titleAr: 'asc' }] });
  const examIds = exams.map(exam => exam.id);
  const links = await prisma.examStudyGroup.findMany({ where: { institutionId, examId: { in: examIds } }, select: { examId: true, studyGroup: { select: { students: { select: { studentEnrollment: { select: { studentId: true } } } } } } } });
  const expected = new Map<string, Set<string>>();
  for (const link of links) {
    const students = expected.get(link.examId) || new Set<string>();
    for (const membership of link.studyGroup.students) students.add(membership.studentEnrollment.studentId);
    expected.set(link.examId, students);
  }
  const results = await prisma.studentExamResult.findMany({ where: { institutionId, examId: { in: examIds } }, select: { examId: true, studentId: true } });
  const recorded = new Map<string, Set<string>>();
  for (const result of results) {
    const students = recorded.get(result.examId) || new Set<string>();
    if (expected.get(result.examId)?.has(result.studentId)) students.add(result.studentId);
    recorded.set(result.examId, students);
  }
  return res.json(exams.map(exam => ({ ...exam, metrics: { expectedStudents: expected.get(exam.id)?.size || 0, recordedStudents: recorded.get(exam.id)?.size || 0 } })));
}

export async function getExamById(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const exam = await prisma.exam.findFirst({
    where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null },
    include: { subject: { select: { id: true, nameAr: true, nameHe: true } }, academicPeriod: { select: { id: true, nameAr: true } }, examType: { select: { id: true, nameAr: true, nameHe: true } } },
  });
  if (!exam) return res.status(404).json({ error: '״§„״§…״×״­״§† ״÷״± …ˆ״¬ˆ״¯.' });
  return res.json(exam);
}

export async function getExamsByIdResultsEnhanced(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const exam = await prisma.exam.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null }, include: { subject: true } });
  if (!exam) return res.status(404).json({ error: '״§„״§…״×״­״§† ״÷״± …ˆ״¬ˆ״¯.' });
  const links = await prisma.examStudyGroup.findMany({ where: { examId: exam.id, institutionId }, include: { studyGroup: { include: { students: { include: { studentEnrollment: { include: { student: { select: { id: true, firstNameAr: true, lastNameAr: true, nationalId: true } }, classRoom: { select: { id: true, nameAr: true } } } } } } } } } });
  if (!links.length) return res.json({ exam, questions: [], results: [], warning: '„… ״×… ״±״¨״· ״£ …״¬…ˆ״¹״© ״×״¹„…״© ״¨‡״°״§ ״§„״§…״×״­״§† ״¨״¹״¯״ ״±״¬‰ ״±״¨״· …״¬…ˆ״¹״© ״£ˆ„‹״§ ‚״¨„ ״±״µ״¯ ״§„†״×״§״¦״¬.' });
  const students = new Map<string, any>();
  for (const link of links) for (const membership of link.studyGroup.students) { const enrollment = membership.studentEnrollment; const current = students.get(enrollment.studentId); students.set(enrollment.studentId, { ...(current || { studentId: enrollment.studentId, studentName: `${enrollment.student.firstNameAr} ${enrollment.student.lastNameAr}`, nationalId: enrollment.student.nationalId, classNameAr: enrollment.classRoom?.nameAr || '', enrollmentId: enrollment.id }), groupIds: [...new Set([...(current?.groupIds || []), link.studyGroupId])] }); }
  const questions = await prisma.examQuestion.findMany({ where: { examId: exam.id, institutionId }, select: { id: true, questionNumber: true, maxScore: true, contentAr: true, contentHe: true, questionType: { select: { nameAr: true } } }, orderBy: { questionNumber: 'asc' } });
  const results = await prisma.studentExamResult.findMany({ where: { examId: exam.id, institutionId } });
  const scores = await prisma.studentQuestionScore.findMany({ where: { institutionId, examQuestionId: { in: questions.map(question => question.id) }, studentId: { in: Array.from(students.keys()) } }, select: { studentId: true, examQuestionId: true, score: true, notes: true } });
  const scoreMap = new Map(scores.map(score => [`${score.studentId}:${score.examQuestionId}`, score]));
  const resultMap = new Map(results.map(item => [item.studentId, item]));
  return res.json({ exam, questions, results: Array.from(students.values()).map(item => { const result = resultMap.get(item.studentId); const totalScore = result ? Number(result.totalScore) : null; const isAbsence = result?.isAbsence ?? false; const percentage = result && Number(exam.maxScore) > 0 ? Number(((totalScore || 0) / Number(exam.maxScore) * 100).toFixed(2)) : null; return { ...item, resultId: result?.id || null, totalScore, isAbsence, percentage, status: isAbsence ? 'ABSENT' : !result ? 'NOT_ENTERED' : percentage! >= 50 ? 'PASS' : 'FAIL', absenceReason: result?.absenceReason || '', notes: result?.notes || '', questionScores: questions.map(question => { const score = scoreMap.get(`${item.studentId}:${question.id}`); return { questionId: question.id, score: score ? Number(score.score) : null, notes: score?.notes || '' }; }) }; }) });
}

export async function createExamsByIdResultsEnhanced(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const exam = await prisma.exam.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null } });
  if (!exam) return res.status(404).json({ error: '״§„״§…״×״­״§† ״÷״± …ˆ״¬ˆ״¯.' });
  if (!Array.isArray(req.body?.results)) return res.status(400).json({ error: '״¨״§†״§״× ״§„†״×״§״¦״¬ ״÷״± ״µ״§„״­״©.' });
  const questions = await prisma.examQuestion.findMany({ where: { examId: exam.id, institutionId }, select: { id: true, maxScore: true } });
  const questionMap = new Map(questions.map(question => [question.id, Number(question.maxScore)]));
  const examMemberships = await prisma.examStudyGroup.findMany({ where: { examId: exam.id, institutionId }, select: { studyGroup: { select: { students: { select: { studentEnrollment: { select: { studentId: true } } } } } } } });
  const allowedStudentIds = new Set(examMemberships.flatMap(link => link.studyGroup.students.map(item => item.studentEnrollment.studentId)));
  try {
    await prisma.$transaction(async tx => {
      const seenStudentIds = new Set<string>();
      for (const item of req.body.results as any[]) {
        const studentId = uuid(item.studentId); if (!studentId) throw new Error('INVALID_EXAM_STUDENT');
        if (!allowedStudentIds.has(studentId)) throw new Error('INVALID_EXAM_STUDENT');
        if (seenStudentIds.has(studentId)) throw new Error('DUPLICATE_EXAM_STUDENT');
        seenStudentIds.add(studentId);
        const absent = Boolean(item.isAbsence ?? item.isAbsent); const suppliedScores = Array.isArray(item.questionScores) ? item.questionScores : [];
        let totalScore = item.totalScore === null || item.totalScore === '' || item.totalScore === undefined ? 0 : Number(item.totalScore);
        if (!absent && suppliedScores.length) { totalScore = 0; for (const scoreItem of suppliedScores) { const questionId = uuid(scoreItem.questionId); if (!questionId || !questionMap.has(questionId)) throw new Error('INVALID_EXAM_QUESTION'); const rawScore = scoreItem.score ?? scoreItem.achievedScore; if (rawScore === '' || rawScore === null || rawScore === undefined) continue; const score = Number(rawScore); const maxScore = questionMap.get(questionId)!; if (!Number.isFinite(score) || score < 0 || score > maxScore) throw new Error('INVALID_QUESTION_SCORE'); totalScore += score; } }
        if (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > Number(exam.maxScore)) throw new Error('INVALID_TOTAL_SCORE');
        const data = { totalScore: absent ? 0 : totalScore, isAbsence: absent, absenceReason: item.absenceReason ? String(item.absenceReason) : null, notes: item.notes ? String(item.notes) : null, updatedAt: new Date() };
        const existing = await tx.studentExamResult.findFirst({ where: { examId: exam.id, studentId, institutionId } });
        if (existing) await tx.studentExamResult.update({ where: { id: existing.id }, data }); else await tx.studentExamResult.create({ data: { institutionId, examId: exam.id, studentId, ...data } });
        if (absent) await tx.studentQuestionScore.deleteMany({ where: { institutionId, studentId, examQuestionId: { in: questions.map(question => question.id) } } });
        else if (suppliedScores.length) for (const scoreItem of suppliedScores) { const questionId = uuid(scoreItem.questionId)!; const rawScore = scoreItem.score ?? scoreItem.achievedScore; if (rawScore === '' || rawScore === null || rawScore === undefined) await tx.studentQuestionScore.deleteMany({ where: { institutionId, studentId, examQuestionId: questionId } }); else await tx.studentQuestionScore.upsert({ where: { examQuestionId_studentId: { examQuestionId: questionId, studentId } }, update: { score: Number(rawScore), notes: scoreItem.notes ? String(scoreItem.notes) : null, updatedAt: new Date() }, create: { institutionId, examQuestionId: questionId, studentId, score: Number(rawScore), notes: scoreItem.notes ? String(scoreItem.notes) : null } }); }
      }
      await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'RESULT_UPDATE', entityType: 'ExamResult', entityId: exam.id, metadata: { resultCount: req.body.results.length } });
    });
  } catch (error: any) { if (String(error?.message || '').startsWith('INVALID_')) return res.status(400).json({ error: '״×״­‚‚ …† ״£† ״§„״¯״±״¬״§״× ״¶…† ״§„״­״¯ ״§„…״³…ˆ״­ „ƒ„ ״³״₪״§„ ˆ„„״§…״×״­״§†.' }); throw error; }
  return res.json({ success: true });
}

export async function getExamStudentResult(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const studentId = uuid(req.params.studentId);
  if (!studentId) return res.status(400).json({ error: 'معرف الطالب غير صالح.' });
  const exam = await prisma.exam.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null } });
  if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود.' });
  const membership = await prisma.examStudyGroup.findFirst({ where: { examId: exam.id, institutionId, studyGroup: { students: { some: { studentEnrollment: { studentId } } } } } });
  if (!membership) return res.status(404).json({ error: 'الطالب غير مرتبط بمجموعات هذا الامتحان.' });
  const [student, questions, result] = await Promise.all([
    prisma.student.findFirst({ where: { id: studentId, institutionId }, select: { id: true, firstNameAr: true, lastNameAr: true, nationalId: true } }),
    prisma.examQuestion.findMany({ where: { examId: exam.id, institutionId }, select: { id: true, questionNumber: true, maxScore: true, contentAr: true }, orderBy: { questionNumber: 'asc' } }),
    prisma.studentExamResult.findFirst({ where: { examId: exam.id, studentId, institutionId } }),
  ]);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود.' });
  const totalScore = result ? Number(result.totalScore) : null;
  const isAbsence = result?.isAbsence ?? false;
  const percentage = result && Number(exam.maxScore) > 0 ? Number(((totalScore || 0) / Number(exam.maxScore) * 100).toFixed(2)) : null;
  const questionScores = result ? await prisma.studentQuestionScore.findMany({ where: { institutionId, studentId, examQuestionId: { in: questions.map(question => question.id) } } }) : [];
  return res.json({ exam, student, result: result ? { ...result, totalScore, isAbsence, percentage, status: isAbsence ? 'ABSENT' : percentage! >= 50 ? 'PASS' : 'FAIL', questionScores: questionScores.map(score => ({ ...score, score: Number(score.score) })) } : { totalScore: null, isAbsence: false, percentage: null, status: 'NOT_ENTERED', questionScores: [] }, questions });
}

export async function createExams(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req); const body = req.body || {};
  if (!institutionId || !academicYearId || !String(body.titleAr || '').trim() || !body.examDate) return res.status(400).json({ error: '״§„״¹†ˆ״§† ˆ״§„״×״§״±״® …״·„ˆ״¨״§†.' });
  const relations = await examRelations(req, body);
  if (!relations?.period || !relations.subject || !relations.examType) return res.status(400).json({ error: '״§„״×״±״© ״£ˆ ״§„…״§״¯״© ״£ˆ †ˆ״¹ ״§„״§…״×״­״§† ״÷״± ״µ״§„״­ „„״³״§‚ ״§„״­״§„.' });
  const exam = await prisma.exam.create({ data: { institutionId, academicYearId, academicPeriodId: relations.period.id, subjectId: relations.subject.id, examTypeId: relations.examType.id, titleAr: String(body.titleAr).trim(), titleHe: String(body.titleHe || '').trim() || null, examDate: new Date(body.examDate), maxScore: Number(body.maxScore ?? 100), weight: body.weight === null || body.weight === '' || body.weight === undefined ? null : Number(body.weight), isPublished: body.isPublished === true, notes: String(body.notes || '').trim() || null, createdBy: uuid(req.user?.uid), updatedBy: uuid(req.user?.uid) } });
  return res.status(201).json(exam);
}

export async function updateExamsById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params.id); const { institutionId, academicYearId } = context(req); const body = req.body || {};
  const existing = await prisma.exam.findFirst({ where: { id, institutionId, academicYearId, archivedAt: null } });
  if (!existing) return res.status(404).json({ error: '״§„״§…״×״­״§† ״÷״± …ˆ״¬ˆ״¯.' });
  const relations = await examRelations(req, { ...existing, ...body, academicPeriodId: body.academicPeriodId || existing.academicPeriodId, subjectId: body.subjectId || existing.subjectId, examTypeId: body.examTypeId || existing.examTypeId });
  if (!relations?.period || !relations.subject || !relations.examType) return res.status(400).json({ error: '״§„״×״±״© ״£ˆ ״§„…״§״¯״© ״£ˆ †ˆ״¹ ״§„״§…״×״­״§† ״÷״± ״µ״§„״­ „„״³״§‚ ״§„״­״§„.' });
  const updated = await prisma.exam.update({ where: { id }, data: { academicPeriodId: relations.period.id, subjectId: relations.subject.id, examTypeId: relations.examType.id, titleAr: body.titleAr !== undefined ? String(body.titleAr).trim() : existing.titleAr, titleHe: body.titleHe !== undefined ? String(body.titleHe || '').trim() || null : existing.titleHe, examDate: body.examDate ? new Date(body.examDate) : existing.examDate, maxScore: body.maxScore !== undefined ? Number(body.maxScore) : existing.maxScore, weight: body.weight === '' || body.weight === null ? null : body.weight !== undefined ? Number(body.weight) : existing.weight, isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : existing.isPublished, notes: body.notes !== undefined ? String(body.notes || '').trim() || null : existing.notes, updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
  return res.json(updated);
}

export async function deleteExamsById(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req); const existing = await prisma.exam.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null } });
  if (!existing) return res.status(404).json({ error: '״§„״§…״×״­״§† ״÷״± …ˆ״¬ˆ״¯.' });
  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: existing.id }, data: { archivedAt: new Date(), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'ARCHIVE', entityType: 'Exam', entityId: existing.id });
  });
  return res.json({ success: true, archived: true });
}

/** Saves the exam header, assigned groups, and questions as one atomic operation. */
export async function saveExamBuilder(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const body = req.body || {};
  const id = String(req.params.id);
  const exam = await prisma.exam.findFirst({ where: { id, institutionId, academicYearId, archivedAt: null } });
  if (!exam) return res.status(404).json({ error: '״§„״§…״×״­״§† ״÷״± …ˆ״¬ˆ״¯.' });

  const relations = await examRelations(req, { ...exam, ...body });
  const titleAr = String(body.titleAr ?? exam.titleAr).trim();
  const examDate = body.examDate ? new Date(body.examDate) : exam.examDate;
  const maxScore = body.maxScore !== undefined ? Number(body.maxScore) : Number(exam.maxScore);
  const weight = body.weight === '' || body.weight === null ? null : body.weight !== undefined ? Number(body.weight) : (exam.weight === null ? null : Number(exam.weight));
  const groupIds: string[] = Array.from(new Set<string>((Array.isArray(body.studyGroupIds) ? body.studyGroupIds : []).map((value: unknown) => uuid(value)).filter((value: string | null): value is string => Boolean(value))));
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!relations?.period || !relations.subject || !relations.examType) return res.status(400).json({ error: '״¨״§†״§״× ״§„״×״±״© ״£ˆ ״§„…״§״¯״© ״£ˆ †ˆ״¹ ״§„״§…״×״­״§† ״÷״± ״µ״§„״­״©.' });
  if (!titleAr || !Number.isFinite(maxScore) || maxScore <= 0 || Number.isNaN(examDate.getTime()) || (weight !== null && (!Number.isFinite(weight) || weight < 0))) return res.status(400).json({ error: '״×״­‚‚ …† ״¹†ˆ״§† ״§„״§…״×״­״§† ˆ״§„״×״§״±״® ˆ״§„״¯״±״¬״§״× ˆ״§„ˆ״²†.' });
  if (!groupIds.length) return res.status(400).json({ error: '״¬״¨ ״±״¨״· ״§„״§…״×״­״§† ״¨…״¬…ˆ״¹״© ״×״¹„…״© ˆ״§״­״¯״© ״¹„‰ ״§„״£‚„.' });
  const groups = await prisma.studyGroup.findMany({ where: { id: { in: groupIds }, institutionId, academicYearId, subjectId: relations.subject.id, isActive: true, archivedAt: null }, select: { id: true, classId: true } });
  if (groups.length !== groupIds.length) return res.status(400).json({ error: '״§„…״¬…ˆ״¹״§״× ״§„…״®״×״§״±״© „״§ ״×״·״§״¨‚ …״§״¯״© ״§„״§…״×״­״§† ״£ˆ ״§„״³†״© ״§„״¯״±״§״³״©.' });
  if (!questions.length) return res.status(400).json({ error: '״£״¶ ״³״₪״§„‹״§ ˆ״§״­״¯‹״§ ״¹„‰ ״§„״£‚„ ‚״¨„ ״§„״­״¸.' });
  type NormalizedQuestion = { questionTypeId: string | null; topicId: string | null; skillId: string | null; questionNumber: number; maxScore: number; contentAr: string | null; contentHe: string | null };
  const normalizedQuestions: NormalizedQuestion[] = questions.map((question: any, index: number) => ({ questionTypeId: uuid(question.questionTypeId), topicId: uuid(question.topicId), skillId: uuid(question.skillId), questionNumber: index + 1, maxScore: Number(question.maxScore ?? question.points), contentAr: String(question.contentAr || '').trim() || null, contentHe: String(question.contentHe || '').trim() || null }));
  if (normalizedQuestions.some(question => !question.questionTypeId || !Number.isFinite(question.maxScore) || question.maxScore <= 0)) return res.status(400).json({ error: 'ƒ„ ״³״₪״§„ ״¬״¨ ״£† ״­״×ˆ ״¹„‰ †ˆ״¹ ˆ״¯״±״¬״© ״µ״­״­״©.' });
  const questionTotal = normalizedQuestions.reduce((sum, question) => sum + question.maxScore, 0);
  if (questionTotal > maxScore + 0.01) return res.status(400).json({ error: `…״¬…ˆ״¹ ״¯״±״¬״§״× ״§„״£״³״¦„״© (${questionTotal}) ״£ƒ״¨״± …† ״§„״¯״±״¬״© ״§„‚״µˆ‰ „„״§…״×״­״§† (${maxScore}).` });
  const gradeLevelIds: string[] = [];
  const [types, topics, skills] = await Promise.all([
    prisma.questionType.findMany({ where: { id: { in: normalizedQuestions.map(q => q.questionTypeId!).filter(Boolean) }, institutionId, isActive: true }, select: { id: true } }),
    prisma.topic.findMany({ where: { id: { in: normalizedQuestions.flatMap(q => q.topicId ? [q.topicId] : []) }, institutionId, subjectId: relations.subject.id, isActive: true, archivedAt: null }, select: { id: true } }),
    prisma.skill.findMany({ where: { id: { in: normalizedQuestions.flatMap(q => q.skillId ? [q.skillId] : []) }, institutionId, subjectId: relations.subject.id, isActive: true, archivedAt: null }, select: { id: true } }),
  ]);
  if (types.length !== new Set(normalizedQuestions.map(q => q.questionTypeId)).size || topics.length !== new Set(normalizedQuestions.flatMap(q => q.topicId ? [q.topicId] : [])).size || skills.length !== new Set(normalizedQuestions.flatMap(q => q.skillId ? [q.skillId] : [])).size) return res.status(400).json({ error: 'ˆ״¬״¯ †ˆ״¹ ״³״₪״§„ ״£ˆ …ˆ״¶ˆ״¹ ״£ˆ …‡״§״±״© ״÷״± …״±״×״¨״· ״¨״§„…״§״¯״© ״£ˆ ״§„…״₪״³״³״©.' });
  const saved = await prisma.$transaction(async tx => {
    const updated = await tx.exam.update({ where: { id: exam.id }, data: { academicPeriodId: relations.period!.id, subjectId: relations.subject!.id, examTypeId: relations.examType!.id, titleAr, titleHe: body.titleHe !== undefined ? String(body.titleHe || '').trim() || null : exam.titleHe, examDate, maxScore, weight, isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : exam.isPublished, notes: body.notes !== undefined ? String(body.notes || '').trim() || null : exam.notes, updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
    await tx.examStudyGroup.deleteMany({ where: { examId: exam.id, institutionId } });
    await tx.examStudyGroup.createMany({ data: groupIds.map(studyGroupId => ({ institutionId, examId: exam.id, studyGroupId })) });
    await tx.examQuestion.deleteMany({ where: { examId: exam.id, institutionId } });
    await tx.examQuestion.createMany({ data: normalizedQuestions.map(question => ({ institutionId, examId: exam.id, ...question, questionTypeId: question.questionTypeId! })) });
    return updated;
  });
  return res.json(saved);
}
export async function getExamsByIdStudyGroups(req: ContextRequest, res: Response): Promise<any> { const { institutionId } = context(req); return res.json(await prisma.examStudyGroup.findMany({ where: { examId: String(req.params.id), institutionId }, include: { studyGroup: { include: { classRoom: { select: { id: true, nameAr: true, gradeLevelId: true, gradeLevel: { select: { id: true, nameAr: true } } } } } } } })); }
export async function createExamsByIdStudyGroups(req: AuthRequest, res: Response): Promise<any> { const { institutionId } = context(req); const exam = await prisma.exam.findFirst({ where: { id: String(req.params.id), institutionId, archivedAt: null } }); if (!exam) return res.status(404).json({ error: 'Exam not found.' }); const ids: string[] = Array.from(new Set<string>(((req.body?.studyGroupIds as unknown[]) || []).map(id => uuid(id)).filter((id): id is string => Boolean(id)))); const groups = await prisma.studyGroup.findMany({ where: { id: { in: ids }, institutionId, academicYearId: exam.academicYearId, subjectId: exam.subjectId, isActive: true, archivedAt: null }, select: { id: true } }); if (groups.length !== ids.length) return res.status(400).json({ error: 'Study groups must match the exam subject and academic year.' }); await prisma.$transaction(async tx => { await tx.examStudyGroup.deleteMany({ where: { examId: exam.id, institutionId } }); if (ids.length) await tx.examStudyGroup.createMany({ data: ids.map(studyGroupId => ({ institutionId, examId: exam.id, studyGroupId })) }); }); return res.json({ success: true }); }
export async function getExamsByIdStudyGroupsBySgIdResults(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId } = context(req);
  const link = await prisma.examStudyGroup.findFirst({ where: { examId: String(req.params.id), studyGroupId: String(req.params.sgId), institutionId } });
  if (!link) return res.status(404).json({ error: 'مجموعة الدراسة غير مرتبطة بالامتحان.' });
  let status = 200; let payload: any;
  const proxy: any = { status(code: number) { status = code; return proxy; }, json(value: any) { payload = value; return proxy; } };
  await getExamsByIdResultsEnhanced(req, proxy);
  if (status !== 200) return res.status(status).json(payload);
  return res.json({ ...payload, results: payload.results.filter((row: any) => row.groupIds?.includes(link.studyGroupId)) });
}
export async function createExamsByIdStudyGroupsBySgIdResults(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId } = context(req);
  const link = await prisma.examStudyGroup.findFirst({ where: { examId: String(req.params.id), studyGroupId: String(req.params.sgId), institutionId }, select: { studyGroup: { select: { students: { select: { studentEnrollment: { select: { studentId: true } } } } } } } });
  if (!link) return res.status(404).json({ error: 'مجموعة الدراسة غير مرتبطة بالامتحان.' });
  const allowed = new Set(link.studyGroup.students.map(item => item.studentEnrollment.studentId));
  if (!Array.isArray(req.body?.results) || (req.body.results as any[]).some(item => !allowed.has(String(item.studentId)))) return res.status(400).json({ error: 'تتضمن النتائج طالبًا من خارج المجموعة.' });
  return createExamsByIdResultsEnhanced(req, res);
}
export async function createExamTypes(req: AuthRequest, res: Response): Promise<any> { const item = await prisma.examType.create({ data: { institutionId: context(req).institutionId, nameAr: String(req.body.nameAr).trim(), nameHe: req.body.nameHe || null, isActive: req.body.isActive !== false, sortOrder: Number(req.body.sortOrder || 0) } }); return res.status(201).json(item); }
export async function updateExamTypesById(req: AuthRequest, res: Response): Promise<any> { const { institutionId } = context(req); const existing = await prisma.examType.findFirst({ where: { id: String(req.params.id), institutionId } }); if (!existing) return res.status(404).json({ error: 'نوع الامتحان غير موجود.' }); const item = await prisma.examType.update({ where: { id: existing.id }, data: { nameAr: String(req.body.nameAr).trim(), nameHe: req.body.nameHe || null, isActive: req.body.isActive !== false, sortOrder: Number(req.body.sortOrder || 0) } }); return res.json(item); }
export async function deleteExamTypesById(req: AuthRequest, res: Response): Promise<any> { const { institutionId } = context(req); const existing = await prisma.examType.findFirst({ where: { id: String(req.params.id), institutionId } }); if (!existing) return res.status(404).json({ error: 'نوع الامتحان غير موجود.' }); await prisma.examType.update({ where: { id: existing.id }, data: { isActive: false } }); return res.json({ success: true }); }
export async function createQuestionTypes(req: AuthRequest, res: Response): Promise<any> { const item = await prisma.questionType.create({ data: { institutionId: context(req).institutionId, nameAr: String(req.body.nameAr).trim(), nameHe: req.body.nameHe || null, isActive: req.body.isActive !== false, sortOrder: Number(req.body.sortOrder || 0) } }); return res.status(201).json(item); }
export async function updateQuestionTypesById(req: AuthRequest, res: Response): Promise<any> { const { institutionId } = context(req); const existing = await prisma.questionType.findFirst({ where: { id: String(req.params.id), institutionId } }); if (!existing) return res.status(404).json({ error: 'نوع السؤال غير موجود.' }); const item = await prisma.questionType.update({ where: { id: existing.id }, data: { nameAr: String(req.body.nameAr).trim(), nameHe: req.body.nameHe || null, isActive: req.body.isActive !== false, sortOrder: Number(req.body.sortOrder || 0) } }); return res.json(item); }
export async function deleteQuestionTypesById(req: AuthRequest, res: Response): Promise<any> { const { institutionId } = context(req); const existing = await prisma.questionType.findFirst({ where: { id: String(req.params.id), institutionId } }); if (!existing) return res.status(404).json({ error: 'نوع السؤال غير موجود.' }); await prisma.questionType.update({ where: { id: existing.id }, data: { isActive: false } }); return res.json({ success: true }); }

export async function getExamsByIdResults(req: ContextRequest, res: Response): Promise<any> {
  return getExamsByIdResultsEnhanced(req, res);
}

export async function getExamTypes(req: ContextRequest, res: Response): Promise<any> { return res.json(await prisma.examType.findMany({ where: { institutionId: context(req).institutionId, isActive: true }, orderBy: { sortOrder: 'asc' } })); }
export async function getExamStatuses(_req: ContextRequest, res: Response): Promise<any> { return res.json([{ id: 'DRAFT', nameAr: '…״³ˆ״¯״©' }, { id: 'PUBLISHED', nameAr: '…†״´ˆ״±' }]); }
export async function getQuestionTypes(req: ContextRequest, res: Response): Promise<any> { return res.json(await prisma.questionType.findMany({ where: { institutionId: context(req).institutionId, isActive: true }, orderBy: { sortOrder: 'asc' } })); }

export async function getExamsByIdQuestions(req: ContextRequest, res: Response): Promise<any> { const { institutionId } = context(req); return res.json(await prisma.examQuestion.findMany({ where: { examId: String(req.params.id), institutionId }, include: { questionType: true, topic: true, skill: true }, orderBy: { questionNumber: 'asc' } })); }
export async function getExamsByIdQuestionContext(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const exam = await prisma.exam.findFirst({ where: { id: String(req.params.id), institutionId, archivedAt: null }, select: { id: true, subjectId: true, academicYearId: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  const links = await prisma.examStudyGroup.findMany({ where: { examId: exam.id, institutionId }, select: { studyGroup: { select: { subjectId: true, academicYearId: true, classRoom: { select: { gradeLevelId: true, gradeLevel: { select: { id: true, nameAr: true } } } } } } } });
  const gradeLevelMap = new Map<string, { id: string; nameAr: string }>();
  for (const link of links) {
    const group = link.studyGroup;
    if (!group.classRoom?.gradeLevelId) continue;
    const gradeLevel = group.classRoom.gradeLevel;
    gradeLevelMap.set(group.classRoom.gradeLevelId, { id: group.classRoom.gradeLevelId, nameAr: gradeLevel?.nameAr || '' });
  }
  const gradeLevelIds = [...gradeLevelMap.keys()];
  const relationFilter = gradeLevelIds.length ? { gradeLevelId: { in: gradeLevelIds } } : {};
  const [topics, skills] = await Promise.all([
    prisma.topic.findMany({ where: { institutionId, subjectId: exam.subjectId, isActive: true, archivedAt: null, ...relationFilter }, include: { gradeLevel: { select: { id: true, nameAr: true } } }, orderBy: [{ gradeLevelId: 'asc' }, { nameAr: 'asc' }] }),
    prisma.skill.findMany({ where: { institutionId, subjectId: exam.subjectId, isActive: true, archivedAt: null, ...relationFilter }, include: { gradeLevel: { select: { id: true, nameAr: true } } }, orderBy: [{ gradeLevelId: 'asc' }, { nameAr: 'asc' }] }),
  ]);
  const includeGradeLevelName = gradeLevelIds.length > 1;
  const addGradeLevelName = (item: any) => includeGradeLevelName ? { ...item, gradeLevelName: item.gradeLevel?.nameAr || null } : item;
  const warning = gradeLevelIds.length === 0 ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u062c\u0645\u0648\u0639\u0629 \u062a\u0639\u0644\u064a\u0645\u064a\u0629 \u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0635\u0641 \u0645\u062d\u062f\u062f \u2014 \u064a\u062a\u0645 \u0639\u0631\u0636 \u0643\u0644 \u0627\u0644\u0645\u0648\u0627\u0636\u064a\u0639 \u0648\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0644\u0644\u0645\u0627\u062f\u0629 \u062f\u0648\u0646 \u0641\u0644\u062a\u0631\u0629 \u062d\u0633\u0628 \u0627\u0644\u0637\u0628\u0642\u0629.' : null;
  return res.json({ topics: topics.map(addGradeLevelName), skills: skills.map(addGradeLevelName), gradeLevels: [...gradeLevelMap.values()], warning });
}
export async function createExamsByIdQuestions(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId } = context(req);
  const exam = await prisma.exam.findFirst({ where: { id: String(req.params.id), institutionId, archivedAt: null } });
  if (!exam) return res.status(404).json({ error: '\u0627\u0644\u0627\u0645\u062a\u062d\u0627\u0646 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.' });
  const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
  const typeIds: string[] = Array.from(new Set(questions.map((q: any) => uuid(q.questionTypeId)).filter((id: string | null): id is string => Boolean(id))));
  const topicIds: string[] = Array.from(new Set(questions.map((q: any) => uuid(q.topicId)).filter((id: string | null): id is string => Boolean(id))));
  const skillIds: string[] = Array.from(new Set(questions.map((q: any) => uuid(q.skillId)).filter((id: string | null): id is string => Boolean(id))));
  const examGroups = await prisma.examStudyGroup.findMany({ where: { examId: exam.id, institutionId, studyGroup: { subjectId: exam.subjectId, academicYearId: exam.academicYearId, isActive: true, archivedAt: null } }, select: { studyGroup: { select: { classRoom: { select: { gradeLevelId: true } } } } } });
  const gradeLevelIds: string[] = Array.from(new Set(examGroups.map(group => group.studyGroup.classRoom?.gradeLevelId).filter((id): id is string => Boolean(id))));
  if (questions.length && !gradeLevelIds.length) return res.status(400).json({ error: '\u064a\u0631\u062c\u0649 \u0631\u0628\u0637 \u0627\u0644\u0627\u0645\u062a\u062d\u0627\u0646 \u0628\u0645\u062c\u0645\u0648\u0639\u0629 \u062a\u062d\u062f\u062f \u0627\u0644\u0637\u0628\u0642\u0629 \u0627\u0644\u062f\u0631\u0627\u0633\u064a\u0629.' });
  const [types, topics, skills] = await Promise.all([
    prisma.questionType.findMany({ where: { id: { in: typeIds }, institutionId, isActive: true }, select: { id: true } }),
    prisma.topic.findMany({ where: { id: { in: topicIds }, institutionId, subjectId: exam.subjectId, gradeLevelId: { in: gradeLevelIds }, isActive: true, archivedAt: null }, select: { id: true } }),
    prisma.skill.findMany({ where: { id: { in: skillIds }, institutionId, subjectId: exam.subjectId, gradeLevelId: { in: gradeLevelIds }, isActive: true, archivedAt: null }, select: { id: true } }),
  ]);
  if (typeIds.length !== types.length) return res.status(400).json({ error: '\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0646\u0648\u0639 \u0633\u0624\u0627\u0644 \u0635\u062d\u064a\u062d.' });
  if (topicIds.length !== topics.length) return res.status(400).json({ error: '\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0648\u0636\u0648\u0639 \u0645\u0631\u062a\u0628\u0637 \u0628\u0645\u0627\u062f\u0629 \u0627\u0644\u0627\u0645\u062a\u062d\u0627\u0646 \u0648\u0627\u0644\u0637\u0628\u0642\u0629.' });
  if (skillIds.length !== skills.length) return res.status(400).json({ error: '\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0647\u0627\u0631\u0629 \u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0645\u0627\u062f\u0629 \u0627\u0644\u0627\u0645\u062a\u062d\u0627\u0646 \u0648\u0627\u0644\u0637\u0628\u0642\u0629.' });
  await prisma.$transaction(async tx => {
    await tx.examQuestion.deleteMany({ where: { examId: exam.id, institutionId } });
    if (questions.length) await tx.examQuestion.createMany({ data: questions.map((q: any, index: number) => ({ institutionId, examId: exam.id, questionTypeId: uuid(q.questionTypeId)!, topicId: uuid(q.topicId), skillId: uuid(q.skillId), questionNumber: Number(q.questionNumber || index + 1), maxScore: Number(q.maxScore ?? q.points ?? 0), contentAr: q.contentAr ? String(q.contentAr) : null, contentHe: q.contentHe ? String(q.contentHe) : null })) });
  });
  return res.json({ success: true });
}
