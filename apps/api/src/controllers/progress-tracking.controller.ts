import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';
import { buildProgressTrackingPoints, buildStudentProgressPoints } from '../services/progress-tracking.service';

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function getProgressTracking(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const academicYearId = String(req.query.academicYearId || req.context?.academicYearId || '');
  const subjectId = String(req.query.subjectId || '');
  const studyGroupId = String(req.query.studyGroupId || '');
  if (!institutionId || !isUuid(academicYearId) || !isUuid(subjectId) || !isUuid(studyGroupId)) {
    return res.status(400).json({ error: 'Academic year, subject, and study group are required.' });
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
    select: { id: true, titleAr: true, examDate: true, maxScore: true, examType: { select: { id: true, nameAr: true } }, studentExamResults: { where: { institutionId, studentId: { in: eligibleStudentIds } }, select: { studentId: true, totalScore: true, isAbsence: true } } },
  });
  const points = buildProgressTrackingPoints(exams.map((exam) => ({ ...exam, maxScore: Number(exam.maxScore), results: exam.studentExamResults.map((result) => ({ ...result, totalScore: Number(result.totalScore) })), eligibleStudentIds })));
  const usable = points.filter((point) => point.averagePercentage !== null);
  const first = usable[0] || null;
  const latest = usable[usable.length - 1] || null;
  const averageChange = first && latest ? Number((latest.averagePercentage! - first.averagePercentage!).toFixed(2)) : null;
  return res.json({
    context: { academicYear, subject, studyGroup },
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
