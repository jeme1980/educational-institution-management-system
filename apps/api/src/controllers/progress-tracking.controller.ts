import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';
import { buildDimensionProgressPoint, buildProgressTrackingPoints, buildStudentProgressPoints, DimensionExamInput, ProgressDimension } from '../services/progress-tracking.service';

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function getProgressTrackingStudyGroups(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const academicYearId = String(req.query.academicYearId || req.context?.academicYearId || '');
  const subjectId = String(req.query.subjectId || '');
  if (!institutionId || !isUuid(academicYearId) || !isUuid(subjectId)) {
    return res.status(400).json({ error: 'Academic year and subject are required.' });
  }

  const [academicYear, subject] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null }, select: { id: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true }, select: { id: true } }),
  ]);
  if (!academicYear || !subject) return res.status(404).json({ error: 'The selected progress tracking context is not available.' });

  return res.json(await prisma.studyGroup.findMany({
    where: { institutionId, academicYearId, subjectId, archivedAt: null, isActive: true, classId: { not: null }, classRoom: { archivedAt: null } },
    select: {
      id: true,
      nameAr: true,
      nameHe: true,
      classId: true,
      subjectId: true,
      classRoom: {
        select: {
          id: true,
          nameAr: true,
          nameHe: true,
          gradeLevelId: true,
          gradeLevel: { select: { id: true, nameAr: true, nameHe: true, sortOrder: true } },
        },
      },
    },
    orderBy: { nameAr: 'asc' },
  }));
}

export async function getProgressTrackingDimensions(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const academicYearId = String(req.query.academicYearId || req.context?.academicYearId || '');
  const subjectId = String(req.query.subjectId || '');
  const studyGroupId = String(req.query.studyGroupId || '');
  const dimension = String(req.query.dimension || '') as ProgressDimension;
  const requestedDimensionId = String(req.query.dimensionId || '');
  if (!institutionId || !isUuid(academicYearId) || !isUuid(subjectId) || !isUuid(studyGroupId) || !['skill', 'topic'].includes(dimension)) {
    return res.status(400).json({ error: 'Academic year, subject, study group, and dimension are required.' });
  }

  const [academicYear, subject, studyGroup] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null }, select: { id: true, yearLabel: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true, nameHe: true } }),
    prisma.studyGroup.findFirst({ where: { id: studyGroupId, institutionId, academicYearId, subjectId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true, classId: true, subjectId: true } }),
  ]);
  if (!academicYear || !subject || !studyGroup) return res.status(404).json({ error: 'The selected progress tracking context is not available.' });

  const memberships = await prisma.studyGroupStudent.findMany({
    where: { institutionId, studyGroupId, studentEnrollment: { institutionId, academicYearId, isActive: true, isDeleted: false, enrollmentStatus: { isActive: true, isFinalStatus: false }, student: { institutionId, isActive: true } } },
    select: { studentEnrollment: { select: { studentId: true } } },
  });
  const eligibleStudentIds = memberships.map((membership) => membership.studentEnrollment.studentId);
  const exams = await prisma.exam.findMany({
    where: { institutionId, academicYearId, subjectId, archivedAt: null, examGroups: { some: { institutionId, studyGroupId } } },
    orderBy: [{ examDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true, titleAr: true, examDate: true,
      examQuestions: { select: { id: true, maxScore: true, skill: { select: { id: true, nameAr: true } }, topic: { select: { id: true, nameAr: true } } } },
      studentExamResults: { where: { institutionId, studentId: { in: eligibleStudentIds } }, select: { studentId: true, isAbsence: true } },
    },
  });
  const questionIds = exams.flatMap((exam) => exam.examQuestions.map((question) => question.id));
  const scores = questionIds.length && eligibleStudentIds.length
    ? await prisma.studentQuestionScore.findMany({ where: { institutionId, examQuestionId: { in: questionIds }, studentId: { in: eligibleStudentIds } }, select: { examQuestionId: true, studentId: true, score: true } })
    : [];
  const scoresByQuestion = new Map<string, { studentId: string; questionId: string; score: number }[]>();
  for (const score of scores) {
    const questionScores = scoresByQuestion.get(score.examQuestionId) || [];
    questionScores.push({ studentId: score.studentId, questionId: score.examQuestionId, score: Number(score.score) });
    scoresByQuestion.set(score.examQuestionId, questionScores);
  }
  const examInputs: DimensionExamInput[] = exams.map((exam) => ({
    examId: exam.id,
    examName: exam.titleAr,
    examDate: exam.examDate.toISOString().slice(0, 10),
    questions: exam.examQuestions.map((question) => ({ id: question.id, maxPoints: Number(question.maxScore), dimensionId: dimension === 'skill' ? question.skill?.id || null : question.topic?.id || null, dimensionName: dimension === 'skill' ? question.skill?.nameAr || null : question.topic?.nameAr || null })),
    participantIds: exam.studentExamResults.filter((result) => !result.isAbsence).map((result) => result.studentId),
    scores: exam.examQuestions.flatMap((question) => scoresByQuestion.get(question.id) || []),
  }));
  const dimensionNames = new Map<string, string>();
  for (const exam of examInputs) for (const question of exam.questions) if (question.dimensionId && question.dimensionName) dimensionNames.set(question.dimensionId, question.dimensionName);
  const availableDimensions = [...dimensionNames.entries()].map(([id, name]) => {
    const points = examInputs.map((exam) => buildDimensionProgressPoint(exam, id));
    return { id, name, measuredExamCount: points.filter((point) => point.status === 'measured').length, totalExamCount: exams.length, latestMastery: [...points].reverse().find((point) => point.status === 'measured')?.masteryRate ?? null };
  }).sort((left, right) => right.measuredExamCount - left.measuredExamCount || left.name.localeCompare(right.name, 'ar'));
  if (requestedDimensionId && !availableDimensions.some((item) => item.id === requestedDimensionId)) {
    return res.status(404).json({ error: 'The selected dimension is not available in this progress tracking context.' });
  }
  const selected = availableDimensions.find((item) => item.id === requestedDimensionId) || availableDimensions[0] || null;
  const points = selected ? examInputs.map((exam) => buildDimensionProgressPoint(exam, selected.id)) : [];
  const measured = points.filter((point) => point.status === 'measured');
  const first = measured[0] || null;
  const latest = measured[measured.length - 1] || null;
  return res.json({
    context: { academicYear, subject, studyGroup },
    dimensionType: dimension,
    availableDimensions,
    selectedDimension: selected ? { ...selected, firstMastery: first?.masteryRate ?? null, latestMastery: latest?.masteryRate ?? null, change: first && latest ? Number((latest.masteryRate! - first.masteryRate!).toFixed(2)) : null } : null,
    points,
  });
}

export async function getProgressTracking(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const academicYearId = String(req.query.academicYearId || req.context?.academicYearId || '');
  const subjectId = String(req.query.subjectId || '');
  const gradeLevelId = String(req.query.gradeLevelId || '');
  const studyGroupId = req.query.studyGroupId ? String(req.query.studyGroupId) : '';
  if (!institutionId || !isUuid(academicYearId) || !isUuid(subjectId) || !isUuid(gradeLevelId) || (studyGroupId && !isUuid(studyGroupId))) {
    return res.status(400).json({ error: 'Academic year, subject, and grade level are required.' });
  }

  const [academicYear, subject, gradeLevel] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null }, select: { id: true, yearLabel: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true, nameHe: true } }),
    prisma.gradeLevel.findUnique({ where: { id: gradeLevelId }, select: { id: true, nameAr: true, nameHe: true, sortOrder: true } }),
  ]);
  if (!academicYear || !subject || !gradeLevel) return res.status(404).json({ error: 'The selected progress tracking context is not available.' });

  const availableStudyGroups = await prisma.studyGroup.findMany({
    where: {
      institutionId,
      academicYearId,
      subjectId,
      archivedAt: null,
      isActive: true,
      classRoom: { institutionId, academicYearId, gradeLevelId, archivedAt: null },
    },
    select: { id: true, nameAr: true, nameHe: true, classId: true, subjectId: true },
    orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
  });
  if (!availableStudyGroups.length) return res.status(404).json({ error: 'No classes are available for the selected grade level.' });
  const studyGroup = studyGroupId ? availableStudyGroups.find((group) => group.id === studyGroupId) || null : null;
  if (studyGroupId && !studyGroup) return res.status(404).json({ error: 'The selected class is not available in this grade level.' });
  const studyGroupIds = studyGroup ? [studyGroup.id] : availableStudyGroups.map((group) => group.id);

  const memberships = await prisma.studyGroupStudent.findMany({
    where: { institutionId, studyGroupId: { in: studyGroupIds }, studentEnrollment: { institutionId, academicYearId, isActive: true, isDeleted: false, enrollmentStatus: { isActive: true, isFinalStatus: false }, student: { institutionId, isActive: true } } },
    select: { studyGroupId: true, studentEnrollment: { select: { studentId: true } } },
  });
  const eligibleStudentIds = [...new Set(memberships.map((membership) => membership.studentEnrollment.studentId))];
  const eligibleStudentIdsByGroup = new Map<string, Set<string>>();
  for (const membership of memberships) {
    const groupStudents = eligibleStudentIdsByGroup.get(membership.studyGroupId) || new Set<string>();
    groupStudents.add(membership.studentEnrollment.studentId);
    eligibleStudentIdsByGroup.set(membership.studyGroupId, groupStudents);
  }

  const exams = await prisma.exam.findMany({
    where: { institutionId, academicYearId, subjectId, archivedAt: null, examGroups: { some: { institutionId, studyGroupId: { in: studyGroupIds } } } },
    orderBy: [{ examDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      titleAr: true,
      examDate: true,
      maxScore: true,
      examType: { select: { id: true, nameAr: true } },
      examGroups: { where: { institutionId, studyGroupId: { in: studyGroupIds } }, select: { studyGroupId: true } },
      studentExamResults: { where: { institutionId, studentId: { in: eligibleStudentIds } }, select: { studentId: true, totalScore: true, isAbsence: true } },
    },
  });
  const points = buildProgressTrackingPoints(exams.map((exam) => ({
    ...exam,
    maxScore: Number(exam.maxScore),
    results: exam.studentExamResults.map((result) => ({ ...result, totalScore: Number(result.totalScore) })),
    eligibleStudentIds: [...new Set(exam.examGroups.flatMap((examGroup) => [...(eligibleStudentIdsByGroup.get(examGroup.studyGroupId) || [])]))],
  })));
  const usable = points.filter((point) => point.averagePercentage !== null);
  const first = usable[0] || null;
  const latest = usable[usable.length - 1] || null;
  const averageChange = first && latest ? Number((latest.averagePercentage! - first.averagePercentage!).toFixed(2)) : null;
  return res.json({
    context: { academicYear, subject, gradeLevel, studyGroup, studyGroupsCount: studyGroupIds.length },
    summary: { examsCount: points.length, firstAverage: first?.averagePercentage ?? null, latestAverage: latest?.averagePercentage ?? null, averageChange },
    points,
  });
}

export async function getStudentProgressTracking(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const academicYearId = String(req.query.academicYearId || req.context?.academicYearId || '');
  const subjectId = String(req.query.subjectId || '');
  const studyGroupId = String(req.query.studyGroupId || '');
  const studentId = String(req.query.studentId || '');
  if (!institutionId || !isUuid(academicYearId) || !isUuid(subjectId) || !isUuid(studyGroupId) || !isUuid(studentId)) {
    return res.status(400).json({ error: 'Academic year, subject, study group, and student are required.' });
  }

  const [academicYear, subject, studyGroup] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null }, select: { id: true, yearLabel: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true, nameHe: true } }),
    prisma.studyGroup.findFirst({ where: { id: studyGroupId, institutionId, academicYearId, subjectId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true, classId: true, subjectId: true } }),
  ]);
  if (!academicYear || !subject || !studyGroup) return res.status(404).json({ error: 'The selected progress tracking context is not available.' });

  const memberships = await prisma.studyGroupStudent.findMany({
    where: { institutionId, studyGroupId, studentEnrollment: { institutionId, academicYearId, isActive: true, isDeleted: false, enrollmentStatus: { isActive: true, isFinalStatus: false }, student: { institutionId, isActive: true } } },
    select: { studentEnrollment: { select: { studentId: true, student: { select: { id: true, firstNameAr: true, lastNameAr: true, nationalId: true } } } } },
  });
  const membership = memberships.find((item) => item.studentEnrollment.studentId === studentId);
  if (!membership) return res.status(404).json({ error: 'The selected student is not an active member of this study group.' });
  const eligibleStudentIds = memberships.map((item) => item.studentEnrollment.studentId);

  const exams = await prisma.exam.findMany({
    where: { institutionId, academicYearId, subjectId, archivedAt: null, examGroups: { some: { institutionId, studyGroupId } } },
    orderBy: [{ examDate: 'asc' }, { id: 'asc' }],
    select: { id: true, titleAr: true, examDate: true, maxScore: true, examType: { select: { id: true, nameAr: true } }, studentExamResults: { where: { institutionId, studentId: { in: eligibleStudentIds } }, select: { studentId: true, totalScore: true, isAbsence: true } } },
  });
  const sourceRows = exams.map((exam) => ({ ...exam, maxScore: Number(exam.maxScore), results: exam.studentExamResults.map((result) => ({ ...result, totalScore: Number(result.totalScore) })), eligibleStudentIds }));
  const groupPoints = buildProgressTrackingPoints(sourceRows);
  const resultsByExam = new Map<string, { totalScore: number; isAbsence: boolean }>();
  for (const exam of exams) {
    const result = exam.studentExamResults.find((item) => item.studentId === studentId);
    if (result) resultsByExam.set(exam.id, { totalScore: Number(result.totalScore), isAbsence: result.isAbsence });
  }
  const points = buildStudentProgressPoints(groupPoints, resultsByExam);
  const completed = points.filter((point) => point.participationStatus === 'completed' && point.studentPercentage !== null);
  const first = completed[0] || null;
  const latest = completed[completed.length - 1] || null;
  const student = membership.studentEnrollment.student;
  return res.json({
    context: { academicYear, subject, studyGroup },
    student: { id: student.id, firstNameAr: student.firstNameAr, lastNameAr: student.lastNameAr, nationalId: student.nationalId },
    summary: {
      examsCount: points.length,
      completedCount: completed.length,
      firstPercentage: first?.studentPercentage ?? null,
      latestPercentage: latest?.studentPercentage ?? null,
      change: first && latest ? Number((latest.studentPercentage! - first.studentPercentage!).toFixed(2)) : null,
      currentGroupGap: latest?.gapFromGroup ?? null,
    },
    points,
  });
}
