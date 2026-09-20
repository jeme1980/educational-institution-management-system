import { prisma } from '../db/prisma';

export interface SchoolDashboardFilters {
  academicYearIds: string[];
  subjectKey?: string;
  gradeLevelIds: string[];
  classIds: string[];
  examTypeIds: string[];
}

export type DashboardAccumulator = { examIds: Set<string>; studentIds: Set<string>; subjectKeys: Set<string>; sum: number; count: number };
type DashboardResult = { studentId: string; totalScore: unknown; isAbsence: boolean };

export class SchoolDashboardFilterError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export const createDashboardAccumulator = (): DashboardAccumulator => ({ examIds: new Set(), studentIds: new Set(), subjectKeys: new Set(), sum: 0, count: 0 });
export const dashboardAverage = (row: DashboardAccumulator): number | null => row.count ? Number((row.sum / row.count).toFixed(2)) : null;

export function addNormalizedResults(row: DashboardAccumulator, examId: string, maxScore: number, results: DashboardResult[], eligibleStudentIds?: Set<string>): void {
  row.examIds.add(examId);
  if (!(maxScore > 0)) return;
  for (const result of results) {
    if (result.isAbsence || (eligibleStudentIds && !eligibleStudentIds.has(result.studentId))) continue;
    const score = Number(result.totalScore);
    if (!Number.isFinite(score)) continue;
    row.studentIds.add(result.studentId);
    row.sum += score / maxScore * 100;
    row.count += 1;
  }
}

class UnionFind {
  private readonly parent = new Map<string, string>();
  add(id: string): void { if (!this.parent.has(id)) this.parent.set(id, id); }
  find(id: string): string { const parent = this.parent.get(id) || id; if (parent === id) return id; const root = this.find(parent); this.parent.set(id, root); return root; }
  union(left: string, right: string): void { this.add(left); this.add(right); const a = this.find(left); const b = this.find(right); if (a !== b) this.parent.set(a < b ? b : a, a < b ? a : b); }
}

export async function getSchoolDashboard(institutionId: string, filters: SchoolDashboardFilters) {
  const years = await prisma.academicYear.findMany({ where: { institutionId, archivedAt: null }, orderBy: [{ startDate: 'asc' }, { id: 'asc' }], select: { id: true, yearLabel: true, startDate: true, endDate: true, isCurrent: true } });
  const requestedYearIds = filters.academicYearIds.length ? filters.academicYearIds : years.map((year) => year.id);
  if (requestedYearIds.some((id) => !years.some((year) => year.id === id))) throw new SchoolDashboardFilterError(404, 'One or more academic years are not available.');
  const selectedYears = years.filter((year) => requestedYearIds.includes(year.id));
  if (!selectedYears.length) throw new SchoolDashboardFilterError(404, 'No academic years are available.');

  const allInstitutionSubjects = await prisma.subject.findMany({ where: { institutionId, archivedAt: null, isActive: true }, select: { id: true, academicYearId: true, nameAr: true, nameHe: true } });
  const selectedYearSubjects = allInstitutionSubjects.filter((subject) => requestedYearIds.includes(subject.academicYearId));
  const institutionSubjectIds = allInstitutionSubjects.map((subject) => subject.id);
  const subjectMappings = institutionSubjectIds.length ? await prisma.academicYearRolloverEntityMap.findMany({ where: { institutionId, entityType: 'SUBJECT', sourceEntityId: { in: institutionSubjectIds }, targetEntityId: { in: institutionSubjectIds } }, select: { sourceEntityId: true, targetEntityId: true } }) : [];
  const subjectIdentity = new UnionFind();
  for (const subject of allInstitutionSubjects) subjectIdentity.add(subject.id);
  for (const mapping of subjectMappings) subjectIdentity.union(mapping.sourceEntityId, mapping.targetEntityId);
  const subjectKeyById = new Map(selectedYearSubjects.map((subject) => [subject.id, subjectIdentity.find(subject.id)]));
  const subjectGroups = new Map<string, typeof selectedYearSubjects>();
  for (const subject of selectedYearSubjects) { const key = subjectKeyById.get(subject.id)!; const rows = subjectGroups.get(key) || []; rows.push(subject); subjectGroups.set(key, rows); }
  const duplicateNames = new Map<string, number>();
  for (const rows of subjectGroups.values()) duplicateNames.set(rows[0].nameAr, (duplicateNames.get(rows[0].nameAr) || 0) + 1);
  const yearLabelById = new Map(years.map((year) => [year.id, year.yearLabel]));
  const subjectOptions = [...subjectGroups.entries()].map(([key, rows]) => ({
    key, nameAr: rows[0].nameAr,
    label: duplicateNames.get(rows[0].nameAr)! > 1 ? `${rows[0].nameAr} · ${rows.map((row) => yearLabelById.get(row.academicYearId)).join('، ')}` : rows[0].nameAr,
    subjectIds: rows.map((row) => row.id), academicYearIds: [...new Set(rows.map((row) => row.academicYearId))],
  })).sort((left, right) => left.label.localeCompare(right.label, 'ar'));
  const selectedSubject = filters.subjectKey ? subjectOptions.find((option) => option.key === filters.subjectKey || option.subjectIds.includes(filters.subjectKey!)) : undefined;
  if (filters.subjectKey && !selectedSubject) throw new SchoolDashboardFilterError(404, 'The selected subject is not available in the selected years.');
  const selectedSubjectIds = selectedSubject?.subjectIds || selectedYearSubjects.map((subject) => subject.id);

  const baseGroups = await prisma.studyGroup.findMany({
    where: { institutionId, academicYearId: { in: requestedYearIds }, subjectId: { in: selectedSubjectIds }, archivedAt: null, isActive: true, classId: { not: null }, classRoom: { archivedAt: null } },
    select: {
      id: true, nameAr: true, academicYearId: true, subjectId: true, classId: true,
      classRoom: { select: { id: true, nameAr: true, gradeLevelId: true, gradeLevel: { select: { id: true, nameAr: true, sortOrder: true } } } },
      students: { where: { studentEnrollment: { academicYearId: { in: requestedYearIds }, isActive: true, isDeleted: false, enrollmentStatus: { isActive: true, isFinalStatus: false }, student: { institutionId, isActive: true } } }, select: { studentEnrollment: { select: { studentId: true } } } },
    },
  });
  const grades = new Map<string, { id: string; nameAr: string; sortOrder: number }>();
  for (const group of baseGroups) if (group.classRoom) grades.set(group.classRoom.gradeLevel.id, group.classRoom.gradeLevel);
  const gradeOptions = [...grades.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.nameAr.localeCompare(right.nameAr, 'ar'));
  if (filters.gradeLevelIds.some((id) => !grades.has(id))) throw new SchoolDashboardFilterError(404, 'One or more grade levels are not available in this context.');
  const gradeScopedGroups = filters.gradeLevelIds.length ? baseGroups.filter((group) => group.classRoom && filters.gradeLevelIds.includes(group.classRoom.gradeLevelId)) : baseGroups;
  const classOptionsMap = new Map<string, { id: string; nameAr: string; gradeLevelId: string; gradeLevelName: string; academicYearId: string; yearLabel: string }>();
  for (const group of gradeScopedGroups) if (group.classRoom) classOptionsMap.set(group.classRoom.id, { id: group.classRoom.id, nameAr: group.classRoom.nameAr, gradeLevelId: group.classRoom.gradeLevelId, gradeLevelName: group.classRoom.gradeLevel.nameAr, academicYearId: group.academicYearId, yearLabel: yearLabelById.get(group.academicYearId) || '—' });
  const classOptions = [...classOptionsMap.values()].sort((left, right) => left.yearLabel.localeCompare(right.yearLabel) || left.gradeLevelName.localeCompare(right.gradeLevelName, 'ar') || left.nameAr.localeCompare(right.nameAr, 'ar'));
  if (filters.classIds.some((id) => !classOptionsMap.has(id))) throw new SchoolDashboardFilterError(404, 'One or more classes are not available in this context.');
  const scopedGroups = filters.classIds.length ? gradeScopedGroups.filter((group) => group.classId && filters.classIds.includes(group.classId)) : gradeScopedGroups;
  const scopedGroupIds = scopedGroups.map((group) => group.id);
  const restrictByGroup = Boolean(filters.gradeLevelIds.length || filters.classIds.length);

  const candidateExams = await prisma.exam.findMany({
    where: { institutionId, academicYearId: { in: requestedYearIds }, subjectId: { in: selectedSubjectIds }, archivedAt: null, ...(restrictByGroup ? { examGroups: { some: { institutionId, studyGroupId: { in: scopedGroupIds } } } } : {}) },
    orderBy: [{ examDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true, academicYearId: true, subjectId: true, examTypeId: true, examDate: true, maxScore: true,
      academicYear: { select: { yearLabel: true } }, subject: { select: { nameAr: true } }, examType: { select: { id: true, nameAr: true, sortOrder: true } },
      examQuestions: { select: { id: true } }, examGroups: { where: { institutionId, studyGroupId: { in: scopedGroupIds } }, select: { studyGroupId: true } },
      studentExamResults: { where: { institutionId }, select: { studentId: true, totalScore: true, isAbsence: true } },
    },
  });
  const examTypeOptionsMap = new Map<string, { id: string; nameAr: string; sortOrder: number }>();
  for (const exam of candidateExams) examTypeOptionsMap.set(exam.examType.id, exam.examType);
  const examTypeOptions = [...examTypeOptionsMap.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.nameAr.localeCompare(right.nameAr, 'ar'));
  if (filters.examTypeIds.some((id) => !examTypeOptionsMap.has(id))) throw new SchoolDashboardFilterError(404, 'One or more exam types are not available in this context.');
  const exams = filters.examTypeIds.length ? candidateExams.filter((exam) => filters.examTypeIds.includes(exam.examTypeId)) : candidateExams;

  const groupMap = new Map(scopedGroups.map((group) => [group.id, { ...group, studentIds: new Set(group.students.map((item) => item.studentEnrollment.studentId)) }]));
  const overall = createDashboardAccumulator(); const subjectRows = new Map<string, DashboardAccumulator>(); const classRows = new Map<string, DashboardAccumulator>(); const gradeRows = new Map<string, DashboardAccumulator>(); const examTypeRows = new Map<string, DashboardAccumulator>();
  const linkedGroupIds = new Set<string>(); const subjectExamIds = new Map<string, Set<string>>(); const groupExamIds = new Map<string, Set<string>>();
  for (const exam of exams) {
    const examGroups = exam.examGroups.map((link) => groupMap.get(link.studyGroupId)).filter(Boolean) as NonNullable<ReturnType<typeof groupMap.get>>[];
    const eligible = new Set(examGroups.flatMap((group) => [...group.studentIds]));
    addNormalizedResults(overall, exam.id, Number(exam.maxScore), exam.studentExamResults, eligible);
    const subjectKey = subjectKeyById.get(exam.subjectId) || exam.subjectId; overall.subjectKeys.add(subjectKey);
    const subjectRowKey = `${exam.academicYearId}:${subjectKey}`; const subjectRow = subjectRows.get(subjectRowKey) || createDashboardAccumulator(); subjectRow.subjectKeys.add(subjectKey); addNormalizedResults(subjectRow, exam.id, Number(exam.maxScore), exam.studentExamResults, eligible); subjectRows.set(subjectRowKey, subjectRow);
    const examTypeKey = `${exam.academicYearId}:${exam.examTypeId}`; const examTypeRow = examTypeRows.get(examTypeKey) || createDashboardAccumulator(); addNormalizedResults(examTypeRow, exam.id, Number(exam.maxScore), exam.studentExamResults, eligible); examTypeRows.set(examTypeKey, examTypeRow);
    const subjectExams = subjectExamIds.get(subjectKey) || new Set<string>(); subjectExams.add(exam.id); subjectExamIds.set(subjectKey, subjectExams);
    for (const group of examGroups) {
      linkedGroupIds.add(group.id); const groupExams = groupExamIds.get(group.id) || new Set<string>(); groupExams.add(exam.id); groupExamIds.set(group.id, groupExams);
      const classRow = classRows.get(group.classRoom!.id) || createDashboardAccumulator(); classRow.subjectKeys.add(subjectKey); addNormalizedResults(classRow, exam.id, Number(exam.maxScore), exam.studentExamResults, group.studentIds); classRows.set(group.classRoom!.id, classRow);
      const gradeRow = gradeRows.get(group.classRoom!.gradeLevelId) || createDashboardAccumulator(); gradeRow.subjectKeys.add(subjectKey); addNormalizedResults(gradeRow, exam.id, Number(exam.maxScore), exam.studentExamResults, group.studentIds); gradeRows.set(group.classRoom!.gradeLevelId, gradeRow);
    }
  }
  const bySubject = [...subjectRows.entries()].map(([compoundKey, row]) => { const [academicYearId, subjectKey] = compoundKey.split(':'); const member = selectedYearSubjects.find((subject) => subject.academicYearId === academicYearId && subjectKeyById.get(subject.id) === subjectKey); return { id: member?.id || subjectKey, subjectKey, subjectName: member?.nameAr || '—', academicYearId, yearLabel: yearLabelById.get(academicYearId) || '—', examCount: row.examIds.size, participatingStudents: row.studentIds.size, averagePerformance: dashboardAverage(row), studyGroupCount: new Set(scopedGroups.filter((group) => group.academicYearId === academicYearId && subjectKeyById.get(group.subjectId) === subjectKey && linkedGroupIds.has(group.id)).map((group) => group.id)).size }; }).sort((left, right) => left.yearLabel.localeCompare(right.yearLabel) || left.subjectName.localeCompare(right.subjectName, 'ar'));
  const byClass = [...classRows.entries()].map(([id, row]) => { const option = classOptionsMap.get(id)!; return { ...option, examCount: row.examIds.size, averagePerformance: dashboardAverage(row), subjectCount: row.subjectKeys.size, participatingStudents: row.studentIds.size }; }).sort((left, right) => left.yearLabel.localeCompare(right.yearLabel) || left.nameAr.localeCompare(right.nameAr, 'ar'));
  const byGrade = [...gradeRows.entries()].map(([id, row]) => ({ id, nameAr: grades.get(id)?.nameAr || '—', sortOrder: grades.get(id)?.sortOrder || 0, examCount: row.examIds.size, averagePerformance: dashboardAverage(row), subjectCount: row.subjectKeys.size, participatingStudents: row.studentIds.size })).sort((left, right) => left.sortOrder - right.sortOrder);
  const byExamType = [...examTypeRows.entries()].map(([compoundKey, row]) => { const [academicYearId, examTypeId] = compoundKey.split(':'); const type = examTypeOptionsMap.get(examTypeId)!; return { academicYearId, yearLabel: yearLabelById.get(academicYearId) || '—', examTypeId, examTypeName: type.nameAr, sortOrder: type.sortOrder, examCount: row.examIds.size, averagePerformance: dashboardAverage(row), participatingStudents: row.studentIds.size }; }).sort((left, right) => left.yearLabel.localeCompare(right.yearLabel) || left.sortOrder - right.sortOrder);
  return {
    context: { academicYears: selectedYears.map(({ startDate: _startDate, endDate: _endDate, ...year }) => year), subject: selectedSubject ? { key: selectedSubject.key, nameAr: selectedSubject.nameAr } : null },
    options: { academicYears: years.map(({ startDate: _startDate, endDate: _endDate, ...year }) => year), subjects: subjectOptions, gradeLevels: gradeOptions, classes: classOptions, examTypes: examTypeOptions },
    summary: { schoolAverage: dashboardAverage(overall), examCount: overall.examIds.size, participatingStudentCount: overall.studentIds.size, subjectCount: overall.subjectKeys.size, studyGroupCount: linkedGroupIds.size },
    coverage: { subjectsWithExams: subjectExamIds.size, studyGroupsWithExams: groupExamIds.size, subjectsWithTwoExams: [...subjectExamIds.values()].filter((ids) => ids.size >= 2).length, studyGroupsWithTwoExams: [...groupExamIds.values()].filter((ids) => ids.size >= 2).length, examsWithQuestionDetail: exams.filter((exam) => exam.examQuestions.length > 0).length, examsWithoutQuestionDetail: exams.filter((exam) => exam.examQuestions.length === 0).length },
    bySubject, byClass, byGrade, byExamType,
  };
}
