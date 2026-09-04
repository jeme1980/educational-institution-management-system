import { prisma } from '../db/prisma';

export type PreviewErrorCode = 'INVALID_YEAR' | 'CROSS_TENANT' | 'TARGET_ARCHIVED' | 'TARGET_CLOSED' | 'TARGET_OLDER' | 'MISSING_TARGET_PERIODS';
export class RolloverPreviewError extends Error {
  constructor(public readonly code: PreviewErrorCode, message: string, public readonly status = 400) { super(message); }
}

const db = prisma as any;
const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const yearNumber = (value: Date | string) => new Date(value).getTime();

export function nextGradeBySortOrder(source: { id: string; sortOrder: number }, grades: Array<{ id: string; sortOrder: number }>) {
  const ordered = [...grades].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const index = ordered.findIndex((item) => item.id === source.id);
  return index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
}

const summary = (items: Array<{ action: string }>) => ({
  total: items.length,
  create: items.filter((item) => item.action === 'CREATE').length,
  exists: items.filter((item) => item.action === 'EXISTS').length,
  conflict: items.filter((item) => item.action === 'CONFLICT').length,
  unresolved: items.filter((item) => item.action === 'UNRESOLVED').length,
});

export async function previewAcademicYearRollover(institutionId: string, input: { sourceAcademicYearId: string; targetAcademicYearId: string }) {
  if (input.sourceAcademicYearId === input.targetAcademicYearId) throw new RolloverPreviewError('INVALID_YEAR', 'Source and target academic years must be different.');
  const [source, target] = await Promise.all([
    db.academicYear.findFirst({ where: { id: input.sourceAcademicYearId, institutionId }, select: { id: true, institutionId: true, yearLabel: true, startDate: true, endDate: true, isClosed: true, archivedAt: true } }),
    db.academicYear.findFirst({ where: { id: input.targetAcademicYearId, institutionId }, select: { id: true, institutionId: true, yearLabel: true, startDate: true, endDate: true, isClosed: true, archivedAt: true } }),
  ]);
  if (!source || !target) throw new RolloverPreviewError('CROSS_TENANT', 'Academic year is not assigned to the current institution.', 404);
  if (source.institutionId !== institutionId || target.institutionId !== institutionId) throw new RolloverPreviewError('CROSS_TENANT', 'Academic year is not assigned to the current institution.', 404);
  if (target.archivedAt) throw new RolloverPreviewError('TARGET_ARCHIVED', 'Target academic year is archived.');
  if (target.isClosed) throw new RolloverPreviewError('TARGET_CLOSED', 'Target academic year is closed.');
  if (source.archivedAt) throw new RolloverPreviewError('INVALID_YEAR', 'Source academic year is archived.');
  if (yearNumber(target.startDate) <= yearNumber(source.startDate)) throw new RolloverPreviewError('TARGET_OLDER', 'Target academic year must be newer than source.');

  const [periods, grades, sourceClasses, targetClasses, sourceSubjects, targetSubjects, sourceAssignments, targetAssignments, sourceEnrollments, targetEnrollments, sourceAnnualSpecs, targetAnnualSpecs, inferredSpecs, topicRows, skillRows, sourceGroups] = await Promise.all([
    db.academicPeriod.findMany({ where: { institutionId, academicYearId: target.id, archivedAt: null, isActive: true }, select: { id: true, nameAr: true, startDate: true, endDate: true, sortOrder: true } }),
    db.gradeLevel.findMany({ where: { isActive: true }, select: { id: true, nameAr: true, nameHe: true, codeNumber: true, sortOrder: true } }),
    db.class.findMany({ where: { institutionId, academicYearId: source.id, archivedAt: null }, include: { stage: true, gradeLevel: true, type: true, composition: true }, orderBy: [{ gradeLevel: { sortOrder: 'asc' } }, { parallelNumber: 'asc' }] }),
    db.class.findMany({ where: { institutionId, academicYearId: target.id, archivedAt: null }, include: { stage: true, gradeLevel: true, type: true, composition: true } }),
    db.subject.findMany({ where: { institutionId, academicYearId: source.id, archivedAt: null }, select: { id: true, nameAr: true, nameHe: true, isActive: true } }),
    db.subject.findMany({ where: { institutionId, academicYearId: target.id, archivedAt: null }, select: { id: true, nameAr: true, nameHe: true, isActive: true } }),
    db.staffAssignment.findMany({ where: { institutionId, academicYearId: source.id, archivedAt: null }, include: { staffMember: true, jobRole: true, subjects: { select: { subjectId: true } } } }),
    db.staffAssignment.findMany({ where: { institutionId, academicYearId: target.id, archivedAt: null }, include: { staffMember: true, jobRole: true } }),
    db.studentEnrollment.findMany({ where: { institutionId, academicYearId: source.id, isDeleted: false }, include: { student: true, classRoom: { include: { stage: true, gradeLevel: true } }, enrollmentStatus: true } }),
    db.studentEnrollment.findMany({ where: { institutionId, academicYearId: target.id, isDeleted: false }, select: { id: true, studentId: true, classId: true, isActive: true, enrollmentStatusId: true } }),
    db.academicYearSpecialization.findMany({ where: { institutionId, academicYearId: source.id, isActive: true }, include: { specialization: true } }),
    db.academicYearSpecialization.findMany({ where: { institutionId, academicYearId: target.id }, select: { specializationId: true, isActive: true } }),
    db.staffAssignment.findMany({ where: { institutionId, academicYearId: source.id, archivedAt: null, staffMember: { specializationId: { not: null } } }, select: { staffMember: { select: { specializationId: true, specialization: true } } } }),
    db.topic.findMany({ where: { institutionId, academicYearId: source.id, archivedAt: null }, select: { id: true, subjectId: true, nameAr: true, nameHe: true } }),
    db.skill.findMany({ where: { institutionId, academicYearId: source.id, archivedAt: null }, select: { id: true, subjectId: true, nameAr: true, nameHe: true } }),
    db.studyGroup.findMany({ where: { institutionId, academicYearId: source.id, archivedAt: null }, select: { id: true, subjectId: true, classId: true, staffAssignmentId: true } }),
  ]);
  const warnings: string[] = [];
  if (!source.isClosed) warnings.push('SOURCE_YEAR_NOT_CLOSED');
  const blockers = periods.length ? [] : ['MISSING_TARGET_PERIODS'];
  const orderedGrades = grades.slice().sort((a: any, b: any) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const gradeMappings = sourceClasses.map((item: any) => {
    const next = nextGradeBySortOrder(item.gradeLevel, orderedGrades);
    return { sourceGrade: item.gradeLevel, suggestedTargetGrade: next, terminalCandidate: !next };
  });
  const targetClassKey = (gradeId: string, item: any) => `${item.stageId}:${gradeId}:${item.parallelNumber}`;
  const classes = sourceClasses.map((item: any) => {
    const next = nextGradeBySortOrder(item.gradeLevel, orderedGrades);
    if (!next) return { source: item, action: 'UNRESOLVED', target: null, reason: 'TERMINAL_GRADE_DECISION_REQUIRED' };
    const match = targetClasses.find((candidate: any) => targetClassKey(next.id, candidate) === targetClassKey(next.id, item));
    if (!match) return { source: item, action: 'CREATE', target: { academicYearId: target.id, stageId: item.stageId, gradeLevelId: next.id, parallelNumber: item.parallelNumber, typeId: item.typeId, compositionId: item.compositionId, nameAr: item.nameAr }, reason: null };
    const sameShape = match.typeId === item.typeId && match.compositionId === item.compositionId;
    return { source: item, action: sameShape ? 'EXISTS' : 'CONFLICT', target: match, reason: sameShape ? null : 'TARGET_CLASS_IDENTITY_CONFLICT' };
  });
  const subjects = sourceSubjects.map((item: any) => {
    const matches = targetSubjects.filter((candidate: any) => clean(candidate.nameAr) === clean(item.nameAr) || (item.nameHe && candidate.nameHe && clean(candidate.nameHe) === clean(item.nameHe)));
    return { source: item, action: matches.length === 0 ? 'CREATE' : matches.length === 1 ? 'EXISTS' : 'CONFLICT', targets: matches, reason: matches.length > 1 ? 'SUBJECT_IDENTITY_AMBIGUOUS' : null };
  });
  const subjectMap = new Map<string, any>(sourceSubjects.map((item: any) => [item.id, subjects.find((row: any) => row.source.id === item.id)] as [string, any]));
  const staffAssignments = sourceAssignments.map((item: any) => {
    const target = targetAssignments.find((candidate: any) => candidate.staffMemberId === item.staffMemberId);
    const same = target && target.jobRoleId === item.jobRoleId && target.isPrimary === item.isPrimary;
    return { source: item, action: !target ? 'CREATE' : same ? 'EXISTS' : 'CONFLICT', target: target || null, reason: target && !same ? 'TARGET_STAFF_ASSIGNMENT_CONFLICT' : null, subjectCount: item.subjects.length, unresolvedSubjectMappings: item.subjects.filter((link: any) => subjectMap.get(link.subjectId)?.action !== 'EXISTS').length };
  });
  const targetEnrollmentByStudent = new Map<string, any>(targetEnrollments.map((item: any) => [item.studentId, item] as [string, any]));
  const students = sourceEnrollments.map((item: any) => {
    const target = targetEnrollmentByStudent.get(item.studentId);
    const sourceClass = item.classRoom;
    const next = nextGradeBySortOrder(sourceClass.gradeLevel, orderedGrades);
    const targetClass = next && targetClasses.find((candidate: any) => targetClassKey(next.id, candidate) === targetClassKey(next.id, sourceClass));
    const terminal = !next;
    const suggestedAction = terminal ? null : 'PROMOTE';
    const validationStatus = terminal ? 'UNRESOLVED' : target && targetClass && target.classId === targetClass.id ? 'VALID' : target ? 'CONFLICT' : targetClass ? 'VALID' : 'UNRESOLVED';
    return { studentId: item.studentId, studentName: `${item.student.firstNameAr} ${item.student.lastNameAr}`.trim(), sourceEnrollmentId: item.id, sourceGrade: sourceClass.gradeLevel, sourceClass, sourceEnrollmentStatus: item.enrollmentStatus, suggestedAction, suggestedTargetGrade: next, suggestedTargetClass: targetClass || null, targetEnrollmentExists: target ? (validationStatus === 'VALID' ? 'EXISTS' : 'CONFLICT') : 'NONE', validationStatus, warnings: terminal ? ['TERMINAL_GRADE_DECISION_REQUIRED'] : [] };
  });
  const buildContentPreview = (rows: any[], targetRows: any[], key: string) => rows.map((row: any) => ({ source: row, targetAction: targetRows.some((target: any) => clean(target.nameAr) === clean(row.nameAr)) ? 'EXISTS' : 'CREATE', target: targetRows.filter((target: any) => clean(target.nameAr) === clean(row.nameAr)) }));
  const specializations = sourceAnnualSpecs.length ? sourceAnnualSpecs.map((row: any) => ({ specializationId: row.specializationId, name: row.specialization.nameAr, sourceIncluded: true, targetAnnualRelationExists: targetAnnualSpecs.some((target: any) => target.specializationId === row.specializationId), targetAction: targetAnnualSpecs.some((target: any) => target.specializationId === row.specializationId) ? 'EXISTS' : 'CREATE_RELATION' })) : [...new Map(inferredSpecs.map((row: any) => [row.staffMember.specializationId, row.staffMember.specialization])).values()].map((spec: any) => ({ specializationId: spec.id, name: spec.nameAr, sourceIncluded: true, targetAnnualRelationExists: targetAnnualSpecs.some((target: any) => target.specializationId === spec.id), targetAction: targetAnnualSpecs.some((target: any) => target.specializationId === spec.id) ? 'EXISTS' : 'CREATE_RELATION' })) ;
  const terminalUnresolved = students.filter((row: any) => row.validationStatus === 'UNRESOLVED').length;
  return {
    sourceYear: source, targetYear: target,
    readiness: { canProceedToDecisions: blockers.length === 0 && terminalUnresolved === 0, blockers, warnings },
    gradeMappings,
    periods: { count: periods.length, ready: periods.length > 0, warnings: [] },
    classes: { summary: summary(classes), items: classes },
    subjects: { summary: summary(subjects), items: subjects },
    topics: { sourceCount: topicRows.length, targetExistingCount: 0, copyCandidates: topicRows.length, conflicts: 0, subjectDependencies: topicRows.map((row: any) => subjectMap.get(row.subjectId)?.action !== 'EXISTS' ? row.subjectId : null).filter(Boolean) },
    skills: { sourceCount: skillRows.length, targetExistingCount: 0, copyCandidates: skillRows.length, conflicts: 0, subjectDependencies: skillRows.map((row: any) => subjectMap.get(row.subjectId)?.action !== 'EXISTS' ? row.subjectId : null).filter(Boolean) },
    specializations: { sourceBasis: sourceAnnualSpecs.length ? 'ANNUAL_RELATION' : 'INFERRED_FROM_STAFF_ASSIGNMENTS', summary: { total: specializations.length, createRelation: specializations.filter((row: any) => row.targetAction === 'CREATE_RELATION').length, exists: specializations.filter((row: any) => row.targetAction === 'EXISTS').length }, items: specializations },
    staffAssignments: { summary: summary(staffAssignments), items: staffAssignments },
    students: { summary: { total: students.length, promoteSuggested: students.filter((row: any) => row.suggestedAction === 'PROMOTE').length, terminalUnresolved, existingTargetEnrollments: students.filter((row: any) => row.targetEnrollmentExists === 'EXISTS').length, conflicts: students.filter((row: any) => row.validationStatus === 'CONFLICT').length, unresolved: terminalUnresolved }, items: students },
    studyGroups: { sourceCount: sourceGroups.length, eligibleForFutureCopy: sourceGroups.length, dependencyWarnings: [] },
    policy: { sourceMutated: false, currentYearChanged: false, historicalRecordsCopied: false },
  };
}
