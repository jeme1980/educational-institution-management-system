import { prisma } from '../db/prisma';
import { recordAuditEvent } from './audit.service';
import { previewAcademicYearRollover } from './academic-year-rollover-preview.service';
import { classMappingValidationStatus } from './academic-year-rollover-contracts';
import { getExecutionPlanFingerprint } from './academic-year-rollover-execution.service';

const db = prisma as any;
const activeStatuses = ['DRAFT', 'READY', 'RUNNING'];

export class RolloverDraftError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly metadata?: Record<string, unknown>) { super(message); }
}

export async function createRolloverDraft(institutionId: string, actorUserId: string | undefined, input: { sourceAcademicYearId: string; targetAcademicYearId: string }) {
  const preview = await previewAcademicYearRollover(institutionId, input);
  return db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `rollover:${institutionId}:${input.sourceAcademicYearId}:${input.targetAcademicYearId}`);
    const existing = await tx.academicYearRollover.findFirst({ where: { institutionId, sourceAcademicYearId: input.sourceAcademicYearId, targetAcademicYearId: input.targetAcademicYearId, status: { in: activeStatuses } }, select: { id: true } });
    if (existing) throw new RolloverDraftError(409, 'ACTIVE_DRAFT_EXISTS', 'An active rollover draft already exists for these academic years.', { existingRolloverId: existing.id });

    const rollover = await tx.academicYearRollover.create({ data: { institutionId, sourceAcademicYearId: input.sourceAcademicYearId, targetAcademicYearId: input.targetAcademicYearId, status: 'DRAFT', createdByUserId: actorUserId || null, summary: { previewReadiness: preview.readiness } } });
    const mappings = preview.classes.items.map((row: any) => ({
      institutionId, rolloverId: rollover.id, sourceClassId: row.source.id,
      action: row.action === 'CREATE' ? 'CREATE' : row.action === 'EXISTS' ? 'USE_EXISTING' : 'SKIP',
      validationStatus: row.action === 'EXISTS' ? 'VALID' : 'UNRESOLVED',
      targetStageId: row.target?.stageId || null, targetGradeLevelId: row.target?.gradeLevelId || null,
      targetClassId: row.action === 'EXISTS' ? row.target?.id || null : null,
      targetParallelNumber: row.target?.parallelNumber || null, targetNameAr: null, targetNameHe: null,
    }));
    await tx.academicYearRolloverClassMapping.createMany({ data: mappings });
    const storedMappings = await tx.academicYearRolloverClassMapping.findMany({ where: { institutionId, rolloverId: rollover.id }, select: { id: true, sourceClassId: true, action: true, targetClassId: true } });
    const mappingBySourceClass = new Map<string, any>((storedMappings as any[]).map((row: any) => [row.sourceClassId, row]));
    await tx.studentRolloverDecision.createMany({ data: preview.students.items.map((row: any) => {
      const mapping: any = mappingBySourceClass.get(row.sourceClass.id);
      const validPromotion = row.suggestedAction === 'PROMOTE' && row.validationStatus === 'VALID' && mapping && mapping.action !== 'SKIP';
      return { institutionId, rolloverId: rollover.id, studentId: row.studentId, sourceEnrollmentId: row.sourceEnrollmentId,
        action: validPromotion ? 'PROMOTE' : null, targetGradeLevelId: validPromotion ? row.suggestedTargetGrade?.id || null : null,
        targetAcademicYearId: validPromotion ? input.targetAcademicYearId : null, targetClassId: mapping?.targetClassId || null,
        targetClassMappingId: validPromotion ? mapping.id : null, targetEnrollmentId: row.targetEnrollmentExists === 'EXISTS' ? row.targetEnrollmentId || null : null,
        validationStatus: validPromotion ? 'VALID' : 'UNRESOLVED', warnings: row.warnings };
    }) });
    await recordAuditEvent(tx, { institutionId, actorUserId, action: 'ROLLOVER_DRAFT_CREATED', entityType: 'AcademicYearRollover', entityId: rollover.id, metadata: { rolloverId: rollover.id, sourceYearId: input.sourceAcademicYearId, targetYearId: input.targetAcademicYearId, classMappingCount: mappings.length, studentDecisionCount: preview.students.items.length } });
    return rollover;
  });
}

export async function getRolloverDraft(institutionId: string, rolloverId: string) {
  const operation = await db.academicYearRollover.findFirst({ where: { id: rolloverId, institutionId }, include: { sourceAcademicYear: true, targetAcademicYear: true, classMappings: { include: { sourceClass: { include: { stage: true, gradeLevel: true } }, targetClass: true, targetStage: true, targetGradeLevel: true }, orderBy: { sourceClass: { gradeLevel: { sortOrder: 'asc' } } } }, studentDecisions: { include: { sourceEnrollment: { include: { student: { select: { firstNameAr: true, lastNameAr: true } }, classRoom: { include: { gradeLevel: true } } } }, targetClassMapping: { include: { targetGradeLevel: true } } }, orderBy: { sourceEnrollmentId: 'asc' } } } });
  if (!operation) throw new RolloverDraftError(404, 'ROLLOVER_NOT_FOUND', 'Rollover draft was not found.');
  const [targetPeriods, preview] = await Promise.all([
    db.academicPeriod.count({ where: { institutionId, academicYearId: operation.targetAcademicYearId, archivedAt: null, isActive: true } }),
    previewAcademicYearRollover(institutionId, { sourceAcademicYearId: operation.sourceAcademicYearId, targetAcademicYearId: operation.targetAcademicYearId }),
  ]);
  const classMappings = operation.classMappings.map((mapping: any) => ({ ...mapping, validationStatus: classMappingValidationStatus(mapping) }));
  const mappingById = new Map<string, any>(classMappings.map((mapping: any) => [mapping.id, mapping]));
  const derivedDecisions = operation.studentDecisions.map((decision: any) => {
    const derivedMapping = decision.targetClassMappingId ? mappingById.get(decision.targetClassMappingId) : null;
    const mappingUsable = derivedMapping && ['CREATE', 'USE_EXISTING'].includes(derivedMapping.action) && derivedMapping.validationStatus === 'VALID';
    const requiresTarget = ['PROMOTE', 'REPEAT'].includes(decision.action || '');
    const validationStatus = requiresTarget && !mappingUsable ? 'UNRESOLVED' : decision.validationStatus;
    return { ...decision, targetClassMapping: derivedMapping || decision.targetClassMapping, validationStatus };
  });
  const unresolvedStudentDecisions = derivedDecisions.filter((row: any) => row.validationStatus === 'UNRESOLVED' || row.validationStatus === 'CONFLICT').length;
  const classMappingConflicts = classMappings.filter((row: any) => row.validationStatus !== 'VALID').length;
  const blockers = [
    ...(targetPeriods ? [] : ['MISSING_TARGET_PERIODS']),
    ...(unresolvedStudentDecisions ? ['UNRESOLVED_STUDENT_DECISIONS'] : []),
    ...(classMappingConflicts ? ['CLASS_MAPPING_CONFLICTS'] : []),
    ...(operation.targetAcademicYear.archivedAt ? ['TARGET_ARCHIVED'] : []),
    ...(operation.targetAcademicYear.isClosed ? ['TARGET_CLOSED'] : []),
  ];
  const warnings = operation.sourceAcademicYear.isClosed ? [] : ['SOURCE_YEAR_NOT_CLOSED'];
  const executionPlanFingerprint = await getExecutionPlanFingerprint(db, institutionId, rolloverId);
  return { operation, executionPlanFingerprint, sourceYear: operation.sourceAcademicYear, targetYear: operation.targetAcademicYear, classMappings, dependencies: { subjects: preview.subjects, specializations: preview.specializations, staffAssignments: preview.staffAssignments, topics: preview.topics, skills: preview.skills, studyGroups: preview.studyGroups }, studentDecisions: { summary: { total: derivedDecisions.length, promote: derivedDecisions.filter((row: any) => row.action === 'PROMOTE').length, repeat: derivedDecisions.filter((row: any) => row.action === 'REPEAT').length, graduate: derivedDecisions.filter((row: any) => row.action === 'GRADUATE').length, skip: derivedDecisions.filter((row: any) => row.action === 'SKIP').length, unresolved: unresolvedStudentDecisions }, items: derivedDecisions }, readiness: { canExecute: operation.status === 'DRAFT' && blockers.length === 0, blockers, warnings, unresolvedStudentDecisions, classMappingConflicts, targetPeriodsReady: targetPeriods > 0, sourceClosed: operation.sourceAcademicYear.isClosed } };
}
