import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';
import { buildDimensionProgressPoint, DimensionExamInput } from '../services/progress-tracking.service';
import { buildOutcomeMeasurement, evaluateInterventionOutcome, INTERVENTION_STATUSES, normalizeInterventionCriterion } from '../services/intervention-tracking.service';

const uuid = (value: unknown): string | null => { const text = String(value || ''); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null; };
const context = (req: ContextRequest) => ({ institutionId: req.context?.institutionId || '', academicYearId: req.context?.academicYearId || '' });

async function loadExamInput(examId: string, institutionId: string, academicYearId: string, participantIds: string[]): Promise<DimensionExamInput | null> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, institutionId, academicYearId, archivedAt: null },
    select: { id: true, titleAr: true, examDate: true, examQuestions: { select: { id: true, maxScore: true, skill: { select: { id: true, nameAr: true } } } }, studentExamResults: { where: { institutionId, studentId: { in: participantIds } }, select: { studentId: true, isAbsence: true } } },
  });
  if (!exam) return null;
  const questionIds = exam.examQuestions.map((question) => question.id);
  const scores = questionIds.length && participantIds.length ? await prisma.studentQuestionScore.findMany({ where: { institutionId, examQuestionId: { in: questionIds }, studentId: { in: participantIds } }, select: { studentId: true, examQuestionId: true, score: true } }) : [];
  return {
    examId: exam.id,
    examName: exam.titleAr,
    examDate: exam.examDate.toISOString().slice(0, 10),
    questions: exam.examQuestions.map((question) => ({ id: question.id, maxPoints: Number(question.maxScore), dimensionId: question.skill?.id || null, dimensionName: question.skill?.nameAr || null })),
    participantIds: exam.studentExamResults.filter((result) => !result.isAbsence).map((result) => result.studentId),
    scores: scores.map((score) => ({ studentId: score.studentId, questionId: score.examQuestionId, score: Number(score.score) })),
  };
}

async function scopeForCreate(req: AuthRequest, body: any) {
  const { institutionId } = context(req);
  const academicYearId = uuid(body.academicYearId);
  const subjectId = uuid(body.subjectId);
  const studyGroupId = uuid(body.studyGroupId);
  const baselineExamId = uuid(body.baselineExamId);
  if (!institutionId || !academicYearId || !subjectId || !studyGroupId || !baselineExamId) return null;
  const [year, subject, group, baselineExam] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null }, select: { id: true, yearLabel: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true } }),
    prisma.studyGroup.findFirst({ where: { id: studyGroupId, institutionId, academicYearId, subjectId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true } }),
    prisma.exam.findFirst({ where: { id: baselineExamId, institutionId, academicYearId, subjectId, archivedAt: null, examGroups: { some: { institutionId, studyGroupId } } }, select: { id: true, titleAr: true, examDate: true } }),
  ]);
  return year && subject && group && baselineExam ? { institutionId, academicYearId, subjectId, studyGroupId, baselineExamId, year, subject, group, baselineExam } : null;
}

function parseSkillIds(value: unknown): Array<{ skillId: string; targetMastery: number | null }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string' ? { skillId: item, targetMastery: null } : { skillId: item?.skillId, targetMastery: item?.targetMastery == null || item?.targetMastery === '' ? null : Number(item.targetMastery) }).filter((item) => Boolean(uuid(item.skillId)) && (item.targetMastery === null || (Number.isFinite(item.targetMastery) && item.targetMastery >= 0 && item.targetMastery <= 100)));
}

export async function getInterventions(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId } = context(req);
  const academicYearId = uuid(req.query.academicYearId) || req.context?.academicYearId || '';
  const subjectId = uuid(req.query.subjectId);
  const studyGroupId = uuid(req.query.studyGroupId);
  const status = String(req.query.status || '');
  const interventions = await prisma.intervention.findMany({
    where: { institutionId, academicYearId, ...(subjectId ? { subjectId } : {}), ...(studyGroupId ? { studyGroupId } : {}), ...(INTERVENTION_STATUSES.includes(status as any) ? { status } : {}), archivedAt: null },
    include: { subject: { select: { id: true, nameAr: true } }, studyGroup: { select: { id: true, nameAr: true } }, baselineExam: { select: { id: true, titleAr: true, examDate: true } }, _count: { select: { students: true, skills: true } } },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
  return res.json(interventions);
}

export async function getInterventionById(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId } = context(req);
  const intervention = await prisma.intervention.findFirst({ where: { id: String(req.params.id), institutionId, archivedAt: null }, include: { academicYear: { select: { id: true, yearLabel: true } }, subject: { select: { id: true, nameAr: true } }, studyGroup: { select: { id: true, nameAr: true } }, baselineExam: { select: { id: true, titleAr: true, examDate: true } }, students: { include: { studentEnrollment: { select: { id: true, studentId: true, student: { select: { id: true, firstNameAr: true, lastNameAr: true, nationalId: true } } } } } }, skills: { include: { skill: { select: { id: true, nameAr: true } } } } } });
  if (!intervention) return res.status(404).json({ error: 'Intervention plan not found.' });
  return res.json({ ...intervention, successCriterion: normalizeInterventionCriterion(intervention.successCriterion) });
}

export async function createIntervention(req: AuthRequest, res: Response): Promise<any> {
  const body = req.body || {};
  const scope = await scopeForCreate(req, body);
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate = body.endDate ? new Date(body.endDate) : null;
  if (!scope || !String(body.title || '').trim() || !startDate || Number.isNaN(startDate.getTime())) return res.status(400).json({ error: 'Context, title, and a valid start date are required.' });
  if (endDate && (Number.isNaN(endDate.getTime()) || endDate < startDate)) return res.status(400).json({ error: 'End date must be valid and not precede the start date.' });
  const studentEnrollmentIds = Array.isArray(body.studentEnrollmentIds) ? body.studentEnrollmentIds.map(uuid).filter(Boolean) as string[] : [];
  const skillInputs = parseSkillIds(body.skillIds);
  if (!studentEnrollmentIds.length || !skillInputs.length) return res.status(400).json({ error: 'At least one target student and skill are required.' });
  const [enrollments, skills] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { institutionId: scope.institutionId, id: { in: studentEnrollmentIds }, academicYearId: scope.academicYearId, isActive: true, isDeleted: false, studyGroupStudents: { some: { institutionId: scope.institutionId, studyGroupId: scope.studyGroupId } } }, select: { id: true, studentId: true } }),
    prisma.skill.findMany({ where: { institutionId: scope.institutionId, id: { in: skillInputs.map((item) => item.skillId) }, academicYearId: scope.academicYearId, subjectId: scope.subjectId, isActive: true, archivedAt: null }, select: { id: true, nameAr: true } }),
  ]);
  if (enrollments.length !== studentEnrollmentIds.length || skills.length !== skillInputs.length) return res.status(400).json({ error: 'One or more target students or skills are outside the selected context.' });
  const participantIds = enrollments.map((enrollment) => enrollment.studentId);
  const baselineInput = await loadExamInput(scope.baselineExamId, scope.institutionId, scope.academicYearId, participantIds);
  if (!baselineInput) return res.status(400).json({ error: 'The baseline exam is not available in the selected context.' });
  const criterion = normalizeInterventionCriterion(body.successCriterion);
  const created = await prisma.$transaction(async (tx) => {
    const intervention = await tx.intervention.create({ data: { institutionId: scope.institutionId, academicYearId: scope.academicYearId, subjectId: scope.subjectId, studyGroupId: scope.studyGroupId, baselineExamId: scope.baselineExamId, title: String(body.title).trim(), activity: body.activity ? String(body.activity).trim() : null, plannedDuration: body.plannedDuration ? String(body.plannedDuration).trim() : null, startDate, endDate, successCriterion: criterion as any, status: 'planned', createdBy: req.user?.uid || null, updatedBy: req.user?.uid || null }, });
    await tx.interventionStudent.createMany({ data: enrollments.map((enrollment) => ({ institutionId: scope.institutionId, interventionId: intervention.id, studentEnrollmentId: enrollment.id })) });
    await tx.interventionSkill.createMany({ data: skills.map((skill) => { const input = skillInputs.find((item) => item.skillId === skill.id)!; const baseline = buildDimensionProgressPoint(baselineInput, skill.id); return { institutionId: scope.institutionId, interventionId: intervention.id, skillId: skill.id, baselineMastery: baseline.masteryRate, targetMastery: input.targetMastery }; }) });
    await recordAuditEvent(tx, { institutionId: scope.institutionId, actorUserId: req.user?.uid, action: 'INTERVENTION_CREATED', entityType: 'Intervention', entityId: intervention.id, metadata: { baselineExamId: scope.baselineExamId, studentCount: enrollments.length, skillCount: skills.length } });
    return intervention;
  });
  return res.status(201).json({ id: created.id });
}

export async function updateIntervention(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId } = context(req);
  const existing = await prisma.intervention.findFirst({ where: { id: String(req.params.id), institutionId, archivedAt: null } });
  if (!existing) return res.status(404).json({ error: 'Intervention plan not found.' });
  const body = req.body || {};
  if (body.status !== undefined && !INTERVENTION_STATUSES.includes(String(body.status) as any)) return res.status(400).json({ error: 'Invalid intervention status.' });
  const nextStartDate = body.startDate ? new Date(body.startDate) : existing.startDate;
  const nextEndDate = body.endDate === null ? null : body.endDate ? new Date(body.endDate) : existing.endDate;
  if (Number.isNaN(nextStartDate.getTime()) || (nextEndDate && (Number.isNaN(nextEndDate.getTime()) || nextEndDate < nextStartDate))) return res.status(400).json({ error: 'Intervention dates are invalid.' });
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.intervention.update({ where: { id: existing.id }, data: { title: body.title === undefined ? undefined : String(body.title).trim(), activity: body.activity === undefined ? undefined : String(body.activity || '').trim() || null, plannedDuration: body.plannedDuration === undefined ? undefined : String(body.plannedDuration || '').trim() || null, startDate: body.startDate ? new Date(body.startDate) : undefined, endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null, successCriterion: body.successCriterion === undefined ? undefined : normalizeInterventionCriterion(body.successCriterion) as any, status: body.status === undefined ? undefined : String(body.status), updatedBy: req.user?.uid || null } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'INTERVENTION_UPDATED', entityType: 'Intervention', entityId: existing.id, metadata: { changedFields: Object.keys(body).filter((key) => ['title', 'activity', 'plannedDuration', 'startDate', 'endDate', 'successCriterion', 'status'].includes(key)) } });
    return item;
  });
  return res.json(updated);
}

export async function getInterventionOutcomes(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId } = context(req);
  const intervention = await prisma.intervention.findFirst({ where: { id: String(req.params.id), institutionId, archivedAt: null }, include: { academicYear: { select: { id: true, yearLabel: true } }, subject: { select: { id: true, nameAr: true } }, studyGroup: { select: { id: true, nameAr: true } }, baselineExam: { select: { id: true, titleAr: true, examDate: true } }, students: { select: { studentEnrollment: { select: { studentId: true } } } }, skills: { include: { skill: { select: { id: true, nameAr: true } } } } } });
  if (!intervention) return res.status(404).json({ error: 'Intervention plan not found.' });
  const participantIds = intervention.students.map((item) => item.studentEnrollment.studentId);
  const exams = await prisma.exam.findMany({ where: { institutionId, academicYearId: intervention.academicYearId, subjectId: intervention.subjectId, archivedAt: null, examDate: { gt: intervention.baselineExam.examDate }, examGroups: { some: { institutionId, studyGroupId: intervention.studyGroupId } } }, select: { id: true }, orderBy: [{ examDate: 'asc' }, { id: 'asc' }] });
  const baseline = await loadExamInput(intervention.baselineExamId, institutionId, intervention.academicYearId, participantIds);
  const followUps = (await Promise.all(exams.map((exam) => loadExamInput(exam.id, institutionId, intervention.academicYearId, participantIds)))).filter(Boolean) as DimensionExamInput[];
  const criterion = normalizeInterventionCriterion(intervention.successCriterion);
  const skillOutcomes = intervention.skills.map((target) => {
    const measurements = followUps.map((exam) => buildOutcomeMeasurement(exam, target.skillId, participantIds.length)).filter((point) => point.status !== 'notMeasured');
    const eligible = measurements.filter((point) => point.status === 'measured');
    const latest = eligible[eligible.length - 1] || null;
    const summary = evaluateInterventionOutcome(target.baselineMastery == null ? null : Number(target.baselineMastery), latest?.masteryRate ?? null, target.targetMastery == null ? criterion.targetMasteryPercentage ?? null : Number(target.targetMastery), participantIds.length, latest?.measuredStudentCount || 0);
    return { skill: target.skill, baselineMastery: target.baselineMastery == null ? null : Number(target.baselineMastery), targetMastery: target.targetMastery == null ? null : Number(target.targetMastery), summary, measurements };
  });
  const changes = skillOutcomes.map((item) => item.summary.change).filter((value): value is number => value !== null);
  const criterionValues = skillOutcomes.map((item) => item.summary.criterionMet).filter((value): value is boolean => value !== null);
  return res.json({ context: { academicYear: intervention.academicYear, subject: intervention.subject, studyGroup: intervention.studyGroup }, baselineExam: intervention.baselineExam, targetedStudentCount: participantIds.length, targetedSkillsCount: skillOutcomes.length, measurementsCount: skillOutcomes.reduce((sum, item) => sum + item.measurements.filter((point) => point.status === 'measured').length, 0), averageObservedChange: changes.length ? Number((changes.reduce((sum, value) => sum + value, 0) / changes.length).toFixed(2)) : null, outcome: changes.length ? (changes.reduce((sum, value) => sum + value, 0) > 0 ? 'improved' : changes.reduce((sum, value) => sum + value, 0) < 0 ? 'declined' : 'noComparison') : 'noComparison', criterionMet: criterionValues.length ? criterionValues.every(Boolean) : null, skills: skillOutcomes });
}
