import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

export interface DashboardStats {
  institutionId: string;
  academicYearId: string;
  academicYearLabel: string;
  kpis: {
    activeStudents: number;
    staffMembers: number;
    classes: number;
    guardians: number;
  };
  studentsByGrade: Array<{ id: string; label: string; stage: string; count: number }>;
  studentsByGender: Array<{ id: string; label: string; count: number }>;
  enrollmentTrend: Array<{ academicYearId: string; yearLabel: string; count: number }>;
  alerts: {
    studentsWithoutGuardian: number;
    studentsWithoutMedicalProfile: number;
    studentsWithSpecialNeeds: number;
  };
  recentEnrollments: Array<{
    id: string;
    createdAt: Date;
    studentName: string;
    className: string;
    gradeLabel: string;
    statusName: string;
  }>;
  studentsByFeature: Array<{ id: string; label: string; count: number }>;
  studentsByEnrollmentStatus: Array<{ id: string; label: string; count: number }>;
  studentsByTown: Array<{ id: string; label: string; count: number }>;
  classDensity: Array<{ id: string; label: string; stage: string; className: string; classCode: string | null; gradeCodeNumber: number; parallelNumber: number; count: number }>;
  staffByRole: Array<{ id: string; label: string; isTeachingRole: boolean; count: number }>;
  subjectCoverage: { total: number; assigned: number; unassigned: number };
  teacherStudentRatio: { teachers: number; students: number; studentsPerTeacher: number };
  examStatus: Array<{ id: string; label: string; count: number }>;
  performance: { average: number; gradedStudents: number; bySubject: Array<{ id: string; label: string; average: number; count: number }> };
  skillPerformance: Array<{ id: string; label: string; average: number; count: number; kind: 'skill' | 'topic' }>;
  support: { specialNeeds: number; medicalProfiles: number; allergiesOrChronic: number; guardiansLinked: number; guardianCoveragePercent: number };
}

type CacheEntry = { expiresAt: number; value: DashboardStats };
const CACHE_TTL_MS = 5 * 60 * 1000;
const dashboardCache = new Map<string, CacheEntry>();

const activeStudentWhere = (institutionId: string, academicYearId: string) => ({
  institutionId,
  academicYearId,
  isActive: true,
  isDeleted: false,
  student: { isActive: true },
});

async function countActiveStudents(institutionId: string, academicYearId: string): Promise<number> {
  return prisma.studentEnrollment.count({ where: activeStudentWhere(institutionId, academicYearId) });
}

async function countStaffMembers(institutionId: string, academicYearId: string): Promise<number> {
  const assignments = await prisma.staffAssignment.findMany({
    where: { institutionId, academicYearId, isActive: true, archivedAt: null, staffMember: { archivedAt: null } },
    select: { staffMemberId: true },
    distinct: ['staffMemberId'],
  });
  return assignments.length;
}

async function countClasses(institutionId: string, academicYearId: string): Promise<number> {
  return prisma.class.count({ where: { institutionId, academicYearId, archivedAt: null } });
}

async function countGuardians(institutionId: string, academicYearId: string): Promise<number> {
  const guardians = await prisma.studentGuardian.findMany({
    where: {
      institutionId,
      student: {
        isActive: true,
        studentEnrollments: {
          some: { institutionId, academicYearId, isActive: true, isDeleted: false },
        },
      },
      guardian: { isActive: true, isDeleted: false },
    },
    select: { guardianId: true },
    distinct: ['guardianId'],
  });
  return guardians.length;
}

async function studentsByGrade(institutionId: string, academicYearId: string): Promise<DashboardStats['studentsByGrade']> {
  const rows = await prisma.studentEnrollment.findMany({
    where: { ...activeStudentWhere(institutionId, academicYearId), classRoom: { archivedAt: null } },
    select: { classRoom: { select: { stage: { select: { id: true, nameAr: true } }, gradeLevel: { select: { id: true, nameAr: true } } } } },
  });
  const grouped = new Map<string, DashboardStats['studentsByGrade'][number]>();
  for (const row of rows) {
    const stage = row.classRoom.stage.nameAr;
    const grade = row.classRoom.gradeLevel;
    const existing = grouped.get(grade.id);
    if (existing) existing.count += 1;
    else grouped.set(grade.id, { id: grade.id, label: grade.nameAr, stage, count: 1 });
  }
  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}

async function studentsByGender(institutionId: string, academicYearId: string): Promise<DashboardStats['studentsByGender']> {
  const rows = await prisma.studentEnrollment.findMany({
    where: activeStudentWhere(institutionId, academicYearId),
    select: { student: { select: { gender: { select: { id: true, nameAr: true } } } } },
  });
  const grouped = new Map<string, DashboardStats['studentsByGender'][number]>();
  for (const row of rows) {
    const gender = row.student.gender;
    const id = gender?.id || 'unknown';
    const label = gender?.nameAr || 'غير محدد';
    const existing = grouped.get(id);
    if (existing) existing.count += 1;
    else grouped.set(id, { id, label, count: 1 });
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

async function groupedEnrollmentData(institutionId: string, academicYearId: string): Promise<Pick<DashboardStats, 'studentsByFeature' | 'studentsByEnrollmentStatus' | 'studentsByTown' | 'classDensity'>> {
  const rows = await prisma.studentEnrollment.findMany({
    where: activeStudentWhere(institutionId, academicYearId),
    select: {
      studentId: true,
      student: { select: { town: { select: { id: true, nameAr: true } } } },
      studentFeature: { select: { id: true, nameAr: true } },
      enrollmentStatus: { select: { id: true, nameAr: true } },
      classRoom: { select: { id: true, nameAr: true, classCode: true, parallelNumber: true, stage: { select: { nameAr: true } }, gradeLevel: { select: { nameAr: true, codeNumber: true } } } },
    },
  });
  const feature = new Map<string, { id: string; label: string; count: number }>();
  const status = new Map<string, { id: string; label: string; count: number }>();
  const town = new Map<string, { id: string; label: string; count: number }>();
  const density = new Map<string, DashboardStats['classDensity'][number] & { studentIds: Set<string> }>();
  for (const row of rows) {
    const f = row.studentFeature || { id: 'unknown', nameAr: 'بدون ميزة محددة' };
    const s = row.enrollmentStatus;
    const t = row.student.town || { id: 'unknown', nameAr: 'بلدة غير محددة' };
    for (const [map, item] of [[feature, { id: f.id, label: f.nameAr }], [status, { id: s.id, label: s.nameAr }], [town, { id: t.id, label: t.nameAr }]] as const) {
      const current = map.get(item.id); if (current) current.count += 1; else map.set(item.id, { ...item, count: 1 });
    }
    const key = row.classRoom.id; const current = density.get(key);
    if (current) current.studentIds.add(row.studentId);
    else density.set(key, { id: key, label: row.classRoom.gradeLevel.nameAr, stage: row.classRoom.stage.nameAr, className: row.classRoom.nameAr, classCode: row.classRoom.classCode, gradeCodeNumber: row.classRoom.gradeLevel.codeNumber, parallelNumber: row.classRoom.parallelNumber, count: 0, studentIds: new Set([row.studentId]) });
  }
  const sort = <T extends { count: number }>(items: T[]) => items.sort((a, b) => b.count - a.count);
  const classDensity = [...density.values()]
    .map(({ studentIds, ...item }) => ({ ...item, count: studentIds.size }))
    .sort((a, b) => a.gradeCodeNumber - b.gradeCodeNumber || a.parallelNumber - b.parallelNumber || a.className.localeCompare(b.className, 'ar'));
  return { studentsByFeature: sort([...feature.values()]), studentsByEnrollmentStatus: sort([...status.values()]), studentsByTown: sort([...town.values()]), classDensity };
}

async function staffAnalytics(institutionId: string, academicYearId: string): Promise<Pick<DashboardStats, 'staffByRole' | 'subjectCoverage' | 'teacherStudentRatio'>> {
  const assignments = await prisma.staffAssignment.findMany({ where: { institutionId, academicYearId, isActive: true, archivedAt: null, staffMember: { archivedAt: null } }, select: { staffMemberId: true, jobRole: { select: { id: true, nameAr: true, isTeachingRole: true } }, subjects: { select: { subjectId: true } } } });
  const roles = new Map<string, DashboardStats['staffByRole'][number]>(); const assignedSubjects = new Set<string>();
  for (const row of assignments) { const role = row.jobRole; const current = roles.get(role.id); if (current) current.count += 1; else roles.set(role.id, { id: role.id, label: role.nameAr, isTeachingRole: role.isTeachingRole, count: 1 }); row.subjects.forEach(subject => assignedSubjects.add(subject.subjectId)); }
  const totalSubjects = await prisma.subject.count({ where: { institutionId, academicYearId, isActive: true, archivedAt: null } });
  const students = await countActiveStudents(institutionId, academicYearId); const teachers = new Set(assignments.filter(item => item.jobRole.isTeachingRole).map(item => item.staffMemberId)).size;
  return { staffByRole: [...roles.values()].sort((a, b) => b.count - a.count), subjectCoverage: { total: totalSubjects, assigned: assignedSubjects.size, unassigned: Math.max(totalSubjects - assignedSubjects.size, 0) }, teacherStudentRatio: { teachers, students, studentsPerTeacher: teachers ? Number((students / teachers).toFixed(2)) : 0 } };
}

async function academicAnalytics(institutionId: string, academicYearId: string): Promise<Pick<DashboardStats, 'examStatus' | 'performance' | 'skillPerformance'>> {
  const today = new Date();
  const exams = await prisma.exam.findMany({ where: { institutionId, academicYearId, archivedAt: null }, select: { id: true, titleAr: true, examDate: true, isPublished: true, subject: { select: { id: true, nameAr: true } }, studentExamResults: { select: { totalScore: true, isAbsence: true } }, examQuestions: { select: { id: true, skill: { select: { id: true, nameAr: true } }, topic: { select: { id: true, nameAr: true } }, studentScores: { select: { score: true } } } } } });
  const status = new Map<string, { id: string; label: string; count: number }>(); const add = (id: string, label: string) => { const item = status.get(id); if (item) item.count += 1; else status.set(id, { id, label, count: 1 }); };
  const subjectScores = new Map<string, { id: string; label: string; sum: number; count: number }>(); let total = 0; let graded = 0;
  const dimensions = new Map<string, { id: string; label: string; kind: 'skill' | 'topic'; sum: number; count: number }>();
  for (const exam of exams) { const date = new Date(exam.examDate); add(date < today && exam.studentExamResults.length ? 'completed' : date < today ? 'incomplete' : 'upcoming', date < today && exam.studentExamResults.length ? 'مكتملة' : date < today ? 'جارية أو غير مكتملة' : 'قادمة'); for (const result of exam.studentExamResults) if (!result.isAbsence) { const score = Number(result.totalScore); total += score; graded += 1; const subject = subjectScores.get(exam.subject.id); if (subject) { subject.sum += score; subject.count += 1; } else subjectScores.set(exam.subject.id, { id: exam.subject.id, label: exam.subject.nameAr, sum: score, count: 1 }); } for (const question of exam.examQuestions) for (const score of question.studentScores) { const value = Number(score.score); for (const dimension of [{ item: question.skill, kind: 'skill' as const }, { item: question.topic, kind: 'topic' as const }]) if (dimension.item) { const key = `${dimension.kind}:${dimension.item.id}`; const current = dimensions.get(key); if (current) { current.sum += value; current.count += 1; } else dimensions.set(key, { id: dimension.item.id, label: dimension.item.nameAr, kind: dimension.kind, sum: value, count: 1 }); } } }
  return { examStatus: [...status.values()], performance: { average: graded ? Number((total / graded).toFixed(2)) : 0, gradedStudents: graded, bySubject: [...subjectScores.values()].map(item => ({ id: item.id, label: item.label, average: Number((item.sum / item.count).toFixed(2)), count: item.count })).sort((a, b) => b.average - a.average) }, skillPerformance: [...dimensions.values()].map(item => ({ id: item.id, label: item.label, kind: item.kind, average: Number((item.sum / item.count).toFixed(2)), count: item.count })).sort((a, b) => b.average - a.average).slice(0, 12) };
}

async function supportAnalytics(institutionId: string, academicYearId: string): Promise<DashboardStats['support']> {
  const active = await prisma.studentEnrollment.findMany({ where: activeStudentWhere(institutionId, academicYearId), select: { studentId: true } }); const ids = active.map(item => item.studentId); const [profiles, linked] = await Promise.all([prisma.studentMedicalProfile.findMany({ where: { institutionId, studentId: { in: ids } }, select: { hasSpecialNeeds: true, allergiesDescription: true, chronicConditions: true } }), prisma.studentGuardian.findMany({ where: { institutionId, studentId: { in: ids }, guardian: { isActive: true, isDeleted: false } }, select: { studentId: true }, distinct: ['studentId'] })]); const covered = linked.length; return { specialNeeds: profiles.filter(item => item.hasSpecialNeeds).length, medicalProfiles: profiles.length, allergiesOrChronic: profiles.filter(item => !!item.allergiesDescription || !!item.chronicConditions).length, guardiansLinked: covered, guardianCoveragePercent: ids.length ? Number((covered / ids.length * 100).toFixed(1)) : 0 };
}

async function enrollmentTrend(institutionId: string, _academicYearId: string): Promise<DashboardStats['enrollmentTrend']> {
  const rows = await prisma.$queryRaw<Array<{ academicYearId: string; yearLabel: string; count: bigint }>>(Prisma.sql`
    SELECT ay."id" AS "academicYearId", ay."yearLabel" AS "yearLabel",
           COUNT(DISTINCT se."studentId")::bigint AS "count"
    FROM "academic_years" ay
    LEFT JOIN "student_enrollments" se
      ON se."academicYearId" = ay."id"
     AND se."institutionId" = CAST(${institutionId} AS uuid)
     AND se."isDeleted" = false
     AND se."isActive" = true
    LEFT JOIN "students" s ON s."id" = se."studentId" AND s."institutionId" = CAST(${institutionId} AS uuid) AND s."isActive" = true
    WHERE ay."institutionId" = CAST(${institutionId} AS uuid)
    GROUP BY ay."id", ay."yearLabel", ay."startDate"
    ORDER BY ay."startDate" ASC
  `);
  return rows.map((row) => ({ academicYearId: row.academicYearId, yearLabel: row.yearLabel, count: Number(row.count) }));
}

async function alerts(institutionId: string, academicYearId: string): Promise<DashboardStats['alerts']> {
  const [row] = await prisma.$queryRaw<Array<{ studentsWithoutGuardian: bigint; studentsWithoutMedicalProfile: bigint; studentsWithSpecialNeeds: bigint }>>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM "student_guardians" sg
        WHERE sg."studentId" = s."id" AND sg."institutionId" = CAST(${institutionId} AS uuid)
      ))::bigint AS "studentsWithoutGuardian",
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM "student_medical_profiles" smp
        WHERE smp."studentId" = s."id" AND smp."institutionId" = CAST(${institutionId} AS uuid)
      ))::bigint AS "studentsWithoutMedicalProfile",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "student_medical_profiles" smp
        WHERE smp."studentId" = s."id" AND smp."institutionId" = CAST(${institutionId} AS uuid) AND smp."hasSpecialNeeds" = true
      ))::bigint AS "studentsWithSpecialNeeds"
    FROM "student_enrollments" se
    INNER JOIN "students" s ON s."id" = se."studentId"
    WHERE se."institutionId" = CAST(${institutionId} AS uuid)
      AND se."academicYearId" = CAST(${academicYearId} AS uuid)
      AND se."isActive" = true AND se."isDeleted" = false
      AND s."institutionId" = CAST(${institutionId} AS uuid)
      AND s."isActive" = true
  `);
  return {
    studentsWithoutGuardian: Number(row?.studentsWithoutGuardian || 0),
    studentsWithoutMedicalProfile: Number(row?.studentsWithoutMedicalProfile || 0),
    studentsWithSpecialNeeds: Number(row?.studentsWithSpecialNeeds || 0),
  };
}

async function recentEnrollments(institutionId: string, academicYearId: string): Promise<DashboardStats['recentEnrollments']> {
  const rows = await prisma.studentEnrollment.findMany({
    where: { institutionId, academicYearId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      student: { select: { firstNameAr: true, lastNameAr: true } },
      classRoom: { select: { nameAr: true, gradeLevel: { select: { nameAr: true } } } },
      enrollmentStatus: { select: { nameAr: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    studentName: `${row.student.firstNameAr} ${row.student.lastNameAr}`.trim(),
    className: row.classRoom.nameAr,
    gradeLabel: row.classRoom.gradeLevel.nameAr,
    statusName: row.enrollmentStatus.nameAr,
  }));
}

export async function getDashboardStats(institutionId: string, academicYearId: string, academicYearLabel: string): Promise<DashboardStats> {
  if (!institutionId || !academicYearId) throw new Error('institutionId and academicYearId are required');
  const cacheKey = `${institutionId}:${academicYearId}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [activeStudents, staffMembers, classes, guardians, studentsByGradeResult, studentsByGenderResult, enrollmentTrendResult, alertsResult, recentEnrollmentsResult, enrollmentAnalytics, staffResult, academicResult, supportResult] = await Promise.all([
    countActiveStudents(institutionId, academicYearId),
    countStaffMembers(institutionId, academicYearId),
    countClasses(institutionId, academicYearId),
    countGuardians(institutionId, academicYearId),
    studentsByGrade(institutionId, academicYearId),
    studentsByGender(institutionId, academicYearId),
    enrollmentTrend(institutionId, academicYearId),
    alerts(institutionId, academicYearId),
    recentEnrollments(institutionId, academicYearId),
    groupedEnrollmentData(institutionId, academicYearId),
    staffAnalytics(institutionId, academicYearId),
    academicAnalytics(institutionId, academicYearId),
    supportAnalytics(institutionId, academicYearId),
  ]);

  const value: DashboardStats = {
    institutionId, academicYearId, academicYearLabel,
    kpis: { activeStudents, staffMembers, classes, guardians },
    studentsByGrade: studentsByGradeResult,
    studentsByGender: studentsByGenderResult,
    enrollmentTrend: enrollmentTrendResult,
    alerts: alertsResult,
    recentEnrollments: recentEnrollmentsResult,
    ...enrollmentAnalytics,
    ...staffResult,
    ...academicResult,
    support: supportResult,
  };
  dashboardCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
