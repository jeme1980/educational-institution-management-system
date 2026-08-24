import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';
import { buildProgressTrackingPoints } from '../services/progress-tracking.service';

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
