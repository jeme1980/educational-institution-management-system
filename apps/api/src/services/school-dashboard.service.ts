import { prisma } from '../db/prisma';

export interface SchoolDashboardResponse {
  context: { academicYear: { id: string; yearLabel: string }; subject: { id: string; nameAr: string } | null };
  summary: { schoolAverage: number | null; examCount: number; participatingStudentCount: number; subjectCount: number; studyGroupCount: number };
  coverage: { subjectsWithExams: number; studyGroupsWithExams: number; subjectsWithTwoExams: number; studyGroupsWithTwoExams: number; examsWithQuestionDetail: number; examsWithoutQuestionDetail: number };
  bySubject: Array<{ id: string; subjectName: string; examCount: number; participatingStudents: number; averagePerformance: number | null; studyGroupCount: number }>;
  byGroup: Array<{ id: string; name: string; examCount: number; averagePerformance: number | null; subjectCount: number; participatingStudents: number }>;
  selectedSubjectGroups?: Array<{ id: string; name: string; examCount: number; averagePerformance: number | null; participatingStudents: number }>;
}

type Accumulator = { examIds: Set<string>; studentIds: Set<string>; subjectIds: Set<string>; sum: number; count: number };
const average = (row: Accumulator): number | null => row.count ? Number((row.sum / row.count).toFixed(2)) : null;

export async function getSchoolDashboard(institutionId: string, academicYearId: string, subjectId?: string): Promise<SchoolDashboardResponse | null> {
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null }, select: { id: true, yearLabel: true } });
  if (!year) return null;
  const subject = subjectId ? await prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true }, select: { id: true, nameAr: true } }) : null;
  if (subjectId && !subject) return null;
  const [groups, exams] = await Promise.all([
    prisma.studyGroup.findMany({ where: { institutionId, academicYearId, archivedAt: null, isActive: true, ...(subjectId ? { subjectId } : {}) }, select: { id: true, nameAr: true, subjectId: true, students: { select: { studentEnrollment: { select: { studentId: true } } } } } }),
    prisma.exam.findMany({ where: { institutionId, academicYearId, archivedAt: null, ...(subjectId ? { subjectId } : {}) }, orderBy: [{ examDate: 'asc' }, { id: 'asc' }], select: { id: true, subjectId: true, maxScore: true, examQuestions: { select: { id: true } }, examGroups: { select: { studyGroupId: true } }, studentExamResults: { select: { studentId: true, totalScore: true, isAbsence: true } } } }),
  ]);
  const groupMap = new Map(groups.map(group => [group.id, { ...group, studentIds: new Set(group.students.map(item => item.studentEnrollment.studentId)) }]));
  const subjectMap = new Map<string, Accumulator>();
  const groupAccumulators = new Map<string, Accumulator>();
  const qualifyingStudents = new Set<string>();
  let schoolSum = 0; let schoolCount = 0;
  const examSubjectIds = new Set<string>(); const examGroupIds = new Set<string>();
  const subjectExamCounts = new Map<string, number>(); const groupExamCounts = new Map<string, number>();
  for (const exam of exams) {
    examSubjectIds.add(exam.subjectId);
    subjectExamCounts.set(exam.subjectId, (subjectExamCounts.get(exam.subjectId) || 0) + 1);
    const maxScore = Number(exam.maxScore);
    const resultByStudent = new Map(exam.studentExamResults.filter(result => !result.isAbsence && maxScore > 0).map(result => [result.studentId, Number((Number(result.totalScore) / maxScore * 100).toFixed(2))]));
    const subjectRow = subjectMap.get(exam.subjectId) || { examIds: new Set(), studentIds: new Set(), subjectIds: new Set(), sum: 0, count: 0 };
    subjectRow.examIds.add(exam.id);
    for (const [studentId, score] of resultByStudent) { const percentage = Number(score); subjectRow.studentIds.add(studentId); subjectRow.sum += percentage; subjectRow.count += 1; schoolSum += percentage; schoolCount += 1; qualifyingStudents.add(studentId); }
    subjectMap.set(exam.subjectId, subjectRow);
    for (const link of exam.examGroups) {
      const group = groupMap.get(link.studyGroupId); if (!group) continue;
      examGroupIds.add(group.id); groupExamCounts.set(group.id, (groupExamCounts.get(group.id) || 0) + 1);
      const row = groupAccumulators.get(group.id) || { examIds: new Set(), studentIds: new Set(), subjectIds: new Set(), sum: 0, count: 0 };
      row.examIds.add(exam.id); row.subjectIds.add(exam.subjectId);
      for (const [studentId, score] of resultByStudent) if (group.studentIds.has(studentId)) { row.studentIds.add(studentId); row.sum += score; row.count += 1; }
      groupAccumulators.set(group.id, row);
    }
  }
  const subjectName = new Map((await prisma.subject.findMany({ where: { institutionId, academicYearId, archivedAt: null, isActive: true, ...(subjectId ? { id: subjectId } : {}) }, select: { id: true, nameAr: true } })).map(item => [item.id, item.nameAr]));
  const bySubject = [...subjectMap.entries()].map(([id, row]) => ({ id, subjectName: subjectName.get(id) || '—', examCount: row.examIds.size, participatingStudents: row.studentIds.size, averagePerformance: average(row), studyGroupCount: groups.filter(group => group.subjectId === id && groupAccumulators.has(group.id)).length })).sort((a, b) => (a.averagePerformance ?? 0) - (b.averagePerformance ?? 0));
  const byGroup = [...groupAccumulators.entries()].map(([id, row]) => ({ id, name: groupMap.get(id)?.nameAr || '—', examCount: row.examIds.size, averagePerformance: average(row), subjectCount: row.subjectIds.size, participatingStudents: row.studentIds.size })).sort((a, b) => (a.averagePerformance ?? 0) - (b.averagePerformance ?? 0));
  const selectedSubjectGroups = subjectId ? byGroup.filter(group => groupMap.get(group.id)?.subjectId === subjectId).map(({ subjectCount: _subjectCount, ...group }) => group) : undefined;
  return {
    context: { academicYear: year, subject },
    summary: { schoolAverage: schoolCount ? Number((schoolSum / schoolCount).toFixed(2)) : null, examCount: exams.length, participatingStudentCount: qualifyingStudents.size, subjectCount: examSubjectIds.size, studyGroupCount: examGroupIds.size },
    coverage: { subjectsWithExams: subjectExamCounts.size, studyGroupsWithExams: groupExamCounts.size, subjectsWithTwoExams: [...subjectExamCounts.values()].filter(count => count >= 2).length, studyGroupsWithTwoExams: [...groupExamCounts.values()].filter(count => count >= 2).length, examsWithQuestionDetail: exams.filter(exam => exam.examQuestions.length > 0).length, examsWithoutQuestionDetail: exams.filter(exam => exam.examQuestions.length === 0).length },
    bySubject, byGroup, ...(selectedSubjectGroups ? { selectedSubjectGroups } : {}),
  };
}
