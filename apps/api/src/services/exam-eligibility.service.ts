import { prisma } from '../db/prisma';

type ExamScope = { id: string; institutionId: string; academicYearId: string; subjectId: string };
type Db = typeof prisma | any;

/** Returns only active students enrolled in the exam's year and in an active group for its subject. */
export async function getEligibleExamStudents(exam: ExamScope, db: Db = prisma): Promise<Array<{ studentId: string; enrollmentId: string }>> {
  const memberships = await db.studyGroupStudent.findMany({
    where: {
      institutionId: exam.institutionId,
      studyGroup: { institutionId: exam.institutionId, academicYearId: exam.academicYearId, subjectId: exam.subjectId, isActive: true, archivedAt: null, examGroups: { some: { institutionId: exam.institutionId, examId: exam.id } } },
      studentEnrollment: {
        institutionId: exam.institutionId,
        academicYearId: exam.academicYearId,
        isActive: true,
        isDeleted: false,
        enrollmentStatus: { isActive: true, isFinalStatus: false },
        student: { institutionId: exam.institutionId, isActive: true },
      },
    },
    select: { studentEnrollment: { select: { id: true, studentId: true } } },
  });
  return memberships.map((row: any) => ({ studentId: row.studentEnrollment.studentId, enrollmentId: row.studentEnrollment.id }));
}

export function eligibleStudentIds(rows: Array<{ studentId: string }>): Set<string> {
  return new Set(rows.map(row => row.studentId));
}
