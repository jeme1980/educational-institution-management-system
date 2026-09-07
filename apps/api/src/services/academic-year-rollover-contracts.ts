export const ROLLOVER_ENTITY_TYPES = [
  'CLASS',
  'SUBJECT',
  'TOPIC',
  'SKILL',
  'STAFF_ASSIGNMENT',
  'STUDENT_ENROLLMENT',
] as const;

export type RolloverEntityType = typeof ROLLOVER_ENTITY_TYPES[number];
export type ClassMappingAction = 'CREATE' | 'USE_EXISTING' | 'SKIP';

export interface ClassMappingContract {
  action: ClassMappingAction;
  targetStageId?: string | null;
  targetGradeLevelId?: string | null;
  targetClassId?: string | null;
  targetParallelNumber?: number | null;
  targetNameAr?: string | null;
  targetNameHe?: string | null;
}

export function classMappingIdentityComplete(mapping: ClassMappingContract): boolean {
  if (mapping.action !== 'CREATE') return true;
  return Boolean(
    mapping.targetStageId
    && mapping.targetGradeLevelId
    && Number.isInteger(mapping.targetParallelNumber)
    && Number(mapping.targetParallelNumber) > 0
    && mapping.targetNameAr?.trim()
    && !mapping.targetClassId,
  );
}

export function classMappingValidationStatus(mapping: ClassMappingContract): 'VALID' | 'UNRESOLVED' {
  if (mapping.action === 'USE_EXISTING') return mapping.targetClassId ? 'VALID' : 'UNRESOLVED';
  if (mapping.action === 'CREATE') return classMappingIdentityComplete(mapping) ? 'VALID' : 'UNRESOLVED';
  return 'UNRESOLVED';
}

export function classMappingPatchData(mapping: ClassMappingContract) {
  if (mapping.action === 'SKIP') return {
    action: 'SKIP' as const, validationStatus: 'UNRESOLVED' as const,
    targetStageId: null, targetGradeLevelId: null, targetClassId: null,
    targetParallelNumber: null, targetNameAr: null, targetNameHe: null,
  };
  if (mapping.action === 'USE_EXISTING') return {
    action: 'USE_EXISTING' as const, validationStatus: classMappingValidationStatus(mapping),
    targetStageId: mapping.targetStageId || null, targetGradeLevelId: mapping.targetGradeLevelId || null,
    targetClassId: mapping.targetClassId || null, targetParallelNumber: mapping.targetParallelNumber || null,
    targetNameAr: null, targetNameHe: null,
  };
  return {
    action: 'CREATE' as const, validationStatus: classMappingValidationStatus(mapping),
    targetStageId: mapping.targetStageId || null, targetGradeLevelId: mapping.targetGradeLevelId || null,
    targetClassId: null, targetParallelNumber: mapping.targetParallelNumber || null,
    targetNameAr: mapping.targetNameAr?.trim() || null, targetNameHe: mapping.targetNameHe?.trim() || null,
  };
}

export function staffAssignmentTargetDates(targetAcademicYear: { startDate: Date }) {
  return { startDate: new Date(targetAcademicYear.startDate), endDate: null };
}

export interface EnrollmentStatusCandidate { id: string; isActive: boolean; sortOrder: number }

export function enrollmentTargetDefaults(targetAcademicYear: { startDate: Date }, statuses: EnrollmentStatusCandidate[]) {
  const status = statuses.filter(item => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))[0];
  if (!status) throw new Error('ACTIVE_ENROLLMENT_STATUS_REQUIRED');
  return { startDate: new Date(targetAcademicYear.startDate), endDate: null, isActive: true, enrollmentStatusId: status.id };
}

export interface AnnualContentIdentity {
  subjectId: string;
  gradeLevelId: string;
  nameAr: string;
  nameHe?: string | null;
  isActive: boolean;
}

export function exactAnnualContentMatch(source: AnnualContentIdentity, candidates: AnnualContentIdentity[]) {
  const matches = candidates.filter(candidate =>
    candidate.subjectId === source.subjectId
    && candidate.gradeLevelId === source.gradeLevelId
    && candidate.nameAr === source.nameAr
    && (candidate.nameHe ?? null) === (source.nameHe ?? null)
    && candidate.isActive === source.isActive,
  );
  return { action: matches.length === 0 ? 'CREATE' as const : matches.length === 1 ? 'REUSE' as const : 'CONFLICT' as const, matches };
}

export const topicTargetMatch = exactAnnualContentMatch;
export const skillTargetMatch = exactAnnualContentMatch;
