import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';
import { platformPrisma } from '../db/platform-prisma';
import { getDashboardStats as getScopedDashboardStats } from '../services/dashboard.service';
import { checkDatabaseReadiness, readinessHttpStatus } from '../services/readiness.service';

export async function getHealth(_req: ContextRequest, res: Response): Promise<any> {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}

export async function getReadiness(_req: ContextRequest, res: Response): Promise<any> {
  const readiness = await checkDatabaseReadiness(prisma, platformPrisma);
  if (readiness.status === 'not_ready') {
    console.error('Readiness database dependency is unavailable.', readiness.services);
  }
  return res.status(readinessHttpStatus(readiness)).json(readiness);
}

export async function getLookups(_req: ContextRequest, res: Response): Promise<any> {
  const [regions, towns, institutionStatuses, languages, educationTypes, educationStages, gradeLevels, classTypes, compositionTypes, genders, studentStatuses, enrollmentStatuses, relationTypes, studentFeatures] = await Promise.all([
    prisma.region.findMany(),
    prisma.town.findMany({ include: { region: true }, orderBy: { nameAr: 'asc' } }),
    prisma.institutionStatus.findMany(),
    prisma.language.findMany(),
    prisma.educationType.findMany(),
    prisma.educationStage.findMany(),
    prisma.gradeLevel.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.classType.findMany(),
    prisma.compositionType.findMany(),
    prisma.gender.findMany(),
    prisma.studentStatus.findMany(),
    prisma.enrollmentStatus.findMany(),
    prisma.relationType.findMany(),
    prisma.studentFeature.findMany({ orderBy: { nameAr: 'asc' } }),
  ]);
  return res.json({ regions, towns, institutionStatuses, languages, educationTypes, educationStages, gradeLevels, classTypes, compositionTypes, genders, studentStatuses, enrollmentStatuses, relationTypes, studentFeatures });
}

export async function getDashboardStats(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'institutionId is required' });
  const academicYearId = req.context?.academicYearId;
  if (!academicYearId) return res.status(409).json({ error: 'academicYearId context is required' });
  const academicYear = await prisma.academicYear.findFirst({
    where: { institutionId, id: academicYearId, archivedAt: null },
    select: { id: true, yearLabel: true },
  });
  if (!academicYear) {
    return res.json({ institutionId, academicYearId: null, academicYearLabel: null, kpis: { activeStudents: 0, staffMembers: 0, classes: 0, guardians: 0 }, studentsByGrade: [], studentsByGender: [], enrollmentTrend: [], alerts: { studentsWithoutGuardian: 0, studentsWithoutMedicalProfile: 0, studentsWithSpecialNeeds: 0 }, recentEnrollments: [], studentsByFeature: [], studentsByEnrollmentStatus: [], studentsByTown: [], classDensity: [], staffByRole: [], subjectCoverage: { total: 0, assigned: 0, unassigned: 0 }, teacherStudentRatio: { teachers: 0, students: 0, studentsPerTeacher: 0 }, examStatus: [], performance: { average: 0, gradedStudents: 0, bySubject: [] }, skillPerformance: [], support: { specialNeeds: 0, medicalProfiles: 0, allergiesOrChronic: 0, guardiansLinked: 0, guardianCoveragePercent: 0 } });
  }
  return res.json(await getScopedDashboardStats(institutionId, academicYear.id, academicYear.yearLabel));
}
