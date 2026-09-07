import { createHash } from 'node:crypto';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from './audit.service';
import { classMappingValidationStatus, enrollmentTargetDefaults, exactAnnualContentMatch, staffAssignmentTargetDates } from './academic-year-rollover-contracts';

const defaultDb = prisma as any;

export class RolloverExecutionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly metadata?: Record<string, unknown>) { super(message); }
}

const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const dateValue = (value: unknown) => value ? new Date(value as any).toISOString() : null;
const sameDate = (left: unknown, right: unknown) => dateValue(left) === dateValue(right);

function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => !['createdAt', 'updatedAt'].includes(key)).map(key => [key, canonical(value[key])]));
  return value;
}

export function executionPlanFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export async function loadRolloverExecutionState(db: any, institutionId: string, rolloverId: string) {
  const operation = await db.academicYearRollover.findFirst({
    where: { id: rolloverId, institutionId },
    include: {
      sourceAcademicYear: true, targetAcademicYear: true,
      classMappings: { include: { sourceClass: { include: { gradeLevel: true } }, targetClass: true } },
      studentDecisions: { include: { sourceEnrollment: true } },
    },
  });
  if (!operation) throw new RolloverExecutionError(404, 'ROLLOVER_NOT_FOUND', 'Rollover was not found.');
  const sourceYearId = operation.sourceAcademicYearId; const targetYearId = operation.targetAcademicYearId;
  const [sourceClasses, sourceEnrollments, sourceSubjects, targetSubjects, sourceTopics, targetTopics, sourceSkills, targetSkills, targetClasses, sourceAssignments, targetAssignments, sourceAnnualSpecializations, targetAnnualSpecializations, inferredSpecializations, targetEnrollments, targetPeriods, enrollmentStatuses] = await Promise.all([
    db.class.findMany({ where: { institutionId, academicYearId: sourceYearId, archivedAt: null } }),
    db.studentEnrollment.findMany({ where: { institutionId, academicYearId: sourceYearId, isDeleted: false } }),
    db.subject.findMany({ where: { institutionId, academicYearId: sourceYearId, archivedAt: null } }),
    db.subject.findMany({ where: { institutionId, academicYearId: targetYearId, archivedAt: null } }),
    db.topic.findMany({ where: { institutionId, academicYearId: sourceYearId, archivedAt: null } }),
    db.topic.findMany({ where: { institutionId, academicYearId: targetYearId, archivedAt: null } }),
    db.skill.findMany({ where: { institutionId, academicYearId: sourceYearId, archivedAt: null } }),
    db.skill.findMany({ where: { institutionId, academicYearId: targetYearId, archivedAt: null } }),
    db.class.findMany({ where: { institutionId, academicYearId: targetYearId, archivedAt: null } }),
    db.staffAssignment.findMany({ where: { institutionId, academicYearId: sourceYearId, archivedAt: null }, include: { subjects: true, staffMember: { select: { specializationId: true } } } }),
    db.staffAssignment.findMany({ where: { institutionId, academicYearId: targetYearId, archivedAt: null }, include: { subjects: true } }),
    db.academicYearSpecialization.findMany({ where: { institutionId, academicYearId: sourceYearId, isActive: true } }),
    db.academicYearSpecialization.findMany({ where: { institutionId, academicYearId: targetYearId } }),
    db.staffAssignment.findMany({ where: { institutionId, academicYearId: sourceYearId, archivedAt: null, staffMember: { specializationId: { not: null } } }, select: { staffMember: { select: { specializationId: true } } } }),
    db.studentEnrollment.findMany({ where: { institutionId, academicYearId: targetYearId, isDeleted: false } }),
    db.academicPeriod.findMany({ where: { institutionId, academicYearId: targetYearId, archivedAt: null, isActive: true } }),
    db.enrollmentStatus.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
  ]);
  return { operation, sourceClasses, sourceEnrollments, sourceSubjects, targetSubjects, sourceTopics, targetTopics, sourceSkills, targetSkills, targetClasses, sourceAssignments, targetAssignments, sourceAnnualSpecializations, targetAnnualSpecializations, inferredSpecializations, targetEnrollments, targetPeriods, enrollmentStatuses };
}

export function fingerprintInput(state: any) {
  const { operation } = state;
  const pick = (rows: any[], fields: string[]) => rows.map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null])));
  const effectiveSpecializationIds = state.sourceAnnualSpecializations.length
    ? state.sourceAnnualSpecializations.map((row: any) => row.specializationId)
    : state.inferredSpecializations.map((row: any) => row.staffMember.specializationId).filter(Boolean);
  return {
    rollover: { id: operation.id, sourceAcademicYearId: operation.sourceAcademicYearId, targetAcademicYearId: operation.targetAcademicYearId },
    classMappings: operation.classMappings.map((row: any) => ({ id: row.id, sourceClassId: row.sourceClassId, action: row.action, targetStageId: row.targetStageId, targetGradeLevelId: row.targetGradeLevelId, targetParallelNumber: row.targetParallelNumber, targetClassId: row.targetClassId, targetNameAr: row.targetNameAr, targetNameHe: row.targetNameHe, validationStatus: classMappingValidationStatus(row) })),
    studentDecisions: pick(operation.studentDecisions, ['id', 'studentId', 'sourceEnrollmentId', 'action', 'targetGradeLevelId', 'targetClassMappingId', 'targetClassId', 'validationStatus']),
    source: {
      classes: pick(state.sourceClasses, ['id', 'stageId', 'gradeLevelId', 'parallelNumber', 'classCode', 'nameAr', 'nameHe', 'typeId', 'compositionId']),
      subjects: pick(state.sourceSubjects, ['id', 'nameAr', 'nameHe', 'isActive']),
      topics: pick(state.sourceTopics, ['id', 'subjectId', 'gradeLevelId', 'nameAr', 'nameHe', 'isActive']),
      skills: pick(state.sourceSkills, ['id', 'subjectId', 'gradeLevelId', 'nameAr', 'nameHe', 'isActive']),
      specializationIds: effectiveSpecializationIds,
      staffAssignments: state.sourceAssignments.map((row: any) => ({ ...pick([row], ['id', 'staffMemberId', 'jobRoleId', 'isPrimary', 'isActive'])[0], subjectIds: row.subjects.map((link: any) => link.subjectId) })),
      enrollments: pick(state.sourceEnrollments, ['id', 'studentId', 'classId', 'enrollmentStatusId', 'startDate', 'endDate', 'isActive', 'isDeleted']),
    },
    target: {
      periods: pick(state.targetPeriods, ['id', 'nameAr', 'nameHe', 'startDate', 'endDate', 'sortOrder', 'isActive']),
      classes: pick(state.targetClasses, ['id', 'stageId', 'gradeLevelId', 'parallelNumber', 'classCode', 'nameAr', 'nameHe', 'typeId', 'compositionId']),
      subjects: pick(state.targetSubjects, ['id', 'nameAr', 'nameHe', 'isActive']),
      topics: pick(state.targetTopics, ['id', 'subjectId', 'gradeLevelId', 'nameAr', 'nameHe', 'isActive']),
      skills: pick(state.targetSkills, ['id', 'subjectId', 'gradeLevelId', 'nameAr', 'nameHe', 'isActive']),
      staffAssignments: state.targetAssignments.map((row: any) => ({ ...pick([row], ['id', 'staffMemberId', 'jobRoleId', 'startDate', 'endDate', 'isPrimary', 'isActive'])[0], subjectIds: row.subjects.map((link: any) => link.subjectId) })),
      enrollments: pick(state.targetEnrollments, ['id', 'studentId', 'classId', 'enrollmentStatusId', 'startDate', 'endDate', 'isActive', 'isDeleted']),
      specializationRelations: pick(state.targetAnnualSpecializations, ['id', 'specializationId', 'isActive']),
    },
  };
}

export async function getExecutionPlanFingerprint(db: any, institutionId: string, rolloverId: string) {
  return executionPlanFingerprint(fingerprintInput(await loadRolloverExecutionState(db, institutionId, rolloverId)));
}

function readiness(state: any) {
  const mappings = new Map(state.operation.classMappings.map((row: any) => [row.id, row]));
  const mappedSourceClasses = new Set(state.operation.classMappings.map((row: any) => row.sourceClassId));
  const decidedSourceEnrollments = new Set(state.operation.studentDecisions.map((row: any) => row.sourceEnrollmentId));
  const classInvalid = state.operation.classMappings.filter((row: any) => classMappingValidationStatus(row) !== 'VALID').length + state.sourceClasses.filter((row: any) => !mappedSourceClasses.has(row.id)).length;
  let studentInvalid = 0;
  for (const decision of state.operation.studentDecisions) {
    if (!decision.action || ['UNRESOLVED', 'CONFLICT'].includes(decision.validationStatus)) { studentInvalid++; continue; }
    if (['PROMOTE', 'REPEAT'].includes(decision.action)) {
      const mapping: any = mappings.get(decision.targetClassMappingId);
      if (!mapping || classMappingValidationStatus(mapping) !== 'VALID' || decision.targetGradeLevelId !== mapping.targetGradeLevelId || (decision.action === 'REPEAT' && decision.targetGradeLevelId !== decision.sourceEnrollment.classId && decision.targetGradeLevelId !== mapping.sourceClass.gradeLevelId)) studentInvalid++;
    }
  }
  studentInvalid += state.sourceEnrollments.filter((row: any) => !decidedSourceEnrollments.has(row.id)).length;
  const blockers = [...(!state.targetPeriods.length ? ['MISSING_TARGET_PERIODS'] : []), ...(classInvalid ? ['CLASS_MAPPING_CONFLICTS'] : []), ...(studentInvalid ? ['UNRESOLVED_STUDENT_DECISIONS'] : []), ...(state.operation.targetAcademicYear.archivedAt ? ['TARGET_ARCHIVED'] : []), ...(state.operation.targetAcademicYear.isClosed ? ['TARGET_CLOSED'] : [])];
  return { canExecute: state.operation.status === 'DRAFT' && blockers.length === 0, blockers };
}

function compatibleClass(target: any, mapping: any) {
  return (!mapping.targetStageId || target.stageId === mapping.targetStageId) && (!mapping.targetGradeLevelId || target.gradeLevelId === mapping.targetGradeLevelId) && (!mapping.targetParallelNumber || target.parallelNumber === mapping.targetParallelNumber) && target.typeId === mapping.sourceClass.typeId && target.compositionId === mapping.sourceClass.compositionId && (mapping.action !== 'CREATE' || (target.nameAr === mapping.targetNameAr.trim() && (target.nameHe ?? null) === (mapping.targetNameHe?.trim() || null)));
}

async function ensureMap(db: any, institutionId: string, rolloverId: string, entityType: string, sourceEntityId: string, targetEntityId: string) {
  const existing = await db.academicYearRolloverEntityMap.findUnique({ where: { rolloverId_entityType_sourceEntityId: { rolloverId, entityType, sourceEntityId } } });
  if (existing && existing.targetEntityId !== targetEntityId) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', `Existing ${entityType} map points to another target.`);
  if (!existing) await db.academicYearRolloverEntityMap.create({ data: { institutionId, rolloverId, entityType, sourceEntityId, targetEntityId } });
}

const emptyCounts = () => ({ created: 0, reused: 0 });

export async function executeAcademicYearRollover(institutionId: string, rolloverId: string, requestedFingerprint: string, actorUserId?: string, options: { failAfterSubjects?: boolean; db?: any } = {}) {
  const db = options.db || defaultDb;
  await db.$executeRawUnsafe('SAVEPOINT rollover_execute');
  try {
    const identity = await db.academicYearRollover.findFirst({ where: { id: rolloverId, institutionId }, select: { sourceAcademicYearId: true, targetAcademicYearId: true } });
    if (!identity) throw new RolloverExecutionError(404, 'ROLLOVER_NOT_FOUND', 'Rollover was not found.');
    const lock = await db.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired', `rollover:${institutionId}:${identity.sourceAcademicYearId}:${identity.targetAcademicYearId}`);
    if (!lock?.[0]?.acquired) throw new RolloverExecutionError(409, 'ROLLOVER_EXECUTION_IN_PROGRESS', 'Rollover execution is already in progress.');
    const state = await loadRolloverExecutionState(db, institutionId, rolloverId);
    if (state.operation.status === 'COMPLETED') { await db.$executeRawUnsafe('RELEASE SAVEPOINT rollover_execute'); return { ...completedResponse(state.operation, true), result: state.operation.summary?.result || state.operation.summary }; }
    if (state.operation.status === 'RUNNING') throw new RolloverExecutionError(409, 'ROLLOVER_EXECUTION_IN_PROGRESS', 'Rollover execution is already in progress.');
    if (state.operation.status !== 'DRAFT') throw new RolloverExecutionError(409, 'ROLLOVER_STATUS_INVALID', `Rollover cannot execute from status ${state.operation.status}.`);
    const currentFingerprint = executionPlanFingerprint(fingerprintInput(state));
    if (currentFingerprint !== requestedFingerprint) throw new RolloverExecutionError(409, 'ROLLOVER_PLAN_CHANGED', 'Rollover execution plan changed.', { executionPlanFingerprint: currentFingerprint });
    const currentReadiness = readiness(state);
    if (!currentReadiness.canExecute) throw new RolloverExecutionError(409, 'ROLLOVER_NOT_READY', 'Rollover is not ready.', { blockers: currentReadiness.blockers });
    const startedAt = new Date();
    await db.academicYearRollover.update({ where: { id: rolloverId }, data: { status: 'RUNNING', startedAt } });
    const result: any = { classes: emptyCounts(), subjects: emptyCounts(), topics: emptyCounts(), skills: emptyCounts(), specializations: { relationsCreated: 0, reused: 0 }, staffAssignments: emptyCounts(), enrollments: emptyCounts(), decisions: { promoted: 0, repeated: 0, graduated: 0, skipped: 0 } };
    const classTargets = new Map<string, string>(); const subjectTargets = new Map<string, string>();

    for (const mapping of state.operation.classMappings) {
      if (mapping.action === 'SKIP') continue;
      let target: any;
      if (mapping.action === 'USE_EXISTING') target = state.targetClasses.find((row: any) => row.id === mapping.targetClassId);
      else {
        const matches = state.targetClasses.filter((row: any) => row.stageId === mapping.targetStageId && row.gradeLevelId === mapping.targetGradeLevelId && row.parallelNumber === mapping.targetParallelNumber);
        if (matches.length > 1) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Target class identity is ambiguous.');
        target = matches[0];
        if (!target) {
          const grade = await db.gradeLevel.findFirst({ where: { id: mapping.targetGradeLevelId, isActive: true } });
          const stage = await db.educationStage.findFirst({ where: { id: mapping.targetStageId, isActive: true } });
          if (!grade || !stage || !mapping.targetNameAr?.trim()) throw new RolloverExecutionError(409, 'ROLLOVER_NOT_READY', 'Target class identity is incomplete.', { blockers: ['CLASS_MAPPING_CONFLICTS'] });
          target = await db.class.create({ data: { institutionId, academicYearId: state.operation.targetAcademicYearId, stageId: mapping.targetStageId, gradeLevelId: mapping.targetGradeLevelId, parallelNumber: mapping.targetParallelNumber, classCode: `${grade.codeNumber}-${mapping.targetParallelNumber}`, nameAr: mapping.targetNameAr.trim(), nameHe: mapping.targetNameHe?.trim() || null, typeId: mapping.sourceClass.typeId, compositionId: mapping.sourceClass.compositionId, createdBy: actorUserId || null } });
          state.targetClasses.push(target); result.classes.created++;
        } else result.classes.reused++;
      }
      if (!target || !compatibleClass(target, mapping)) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Target class is incompatible with the rollover mapping.');
      if (mapping.action === 'USE_EXISTING') result.classes.reused++;
      classTargets.set(mapping.id, target.id); await ensureMap(db, institutionId, rolloverId, 'CLASS', mapping.sourceClassId, target.id);
    }

    for (const source of state.sourceSubjects) {
      const matches = state.targetSubjects.filter((row: any) => clean(row.nameAr) === clean(source.nameAr) || (source.nameHe && row.nameHe && clean(row.nameHe) === clean(source.nameHe)));
      if (matches.length > 1) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Target subject identity is ambiguous.');
      let target = matches[0];
      if (target && (target.isActive !== source.isActive || clean(target.nameAr) !== clean(source.nameAr) || (target.nameHe ?? null) !== (source.nameHe ?? null))) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Target subject is incompatible.');
      if (!target) { target = await db.subject.create({ data: { institutionId, academicYearId: state.operation.targetAcademicYearId, nameAr: source.nameAr, nameHe: source.nameHe, isActive: source.isActive, createdBy: actorUserId || null } }); state.targetSubjects.push(target); result.subjects.created++; }
      else result.subjects.reused++;
      subjectTargets.set(source.id, target.id); await ensureMap(db, institutionId, rolloverId, 'SUBJECT', source.id, target.id);
    }
    if (options.failAfterSubjects) throw new Error('INJECTED_ROLLOVER_FAILURE');

    for (const [kind, sourceRows, targetRows, counter] of [['TOPIC', state.sourceTopics, state.targetTopics, result.topics], ['SKILL', state.sourceSkills, state.targetSkills, result.skills]] as any[]) {
      for (const source of sourceRows) {
        const subjectId = subjectTargets.get(source.subjectId); if (!subjectId) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', `${kind} subject mapping is missing.`);
        const identityValue = { subjectId, gradeLevelId: source.gradeLevelId, nameAr: source.nameAr, nameHe: source.nameHe, isActive: source.isActive };
        const match = exactAnnualContentMatch(identityValue, targetRows);
        if (match.action === 'CONFLICT') throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', `Target ${kind} identity is ambiguous.`);
        let target: any = match.matches[0];
        if (!target) { target = await db[kind === 'TOPIC' ? 'topic' : 'skill'].create({ data: { institutionId, academicYearId: state.operation.targetAcademicYearId, ...identityValue, createdBy: actorUserId || null } }); targetRows.push(target); counter.created++; }
        else counter.reused++;
        await ensureMap(db, institutionId, rolloverId, kind, source.id, target.id);
      }
    }

    const specializationIds = [...new Set<string>((state.sourceAnnualSpecializations.length ? state.sourceAnnualSpecializations.map((row: any) => row.specializationId) : state.inferredSpecializations.map((row: any) => row.staffMember.specializationId)).filter(Boolean))];
    for (const specializationId of specializationIds) {
      const existing = state.targetAnnualSpecializations.find((row: any) => row.specializationId === specializationId);
      if (existing && !existing.isActive) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Target specialization relation is inactive.');
      if (!existing) { await db.academicYearSpecialization.create({ data: { institutionId, academicYearId: state.operation.targetAcademicYearId, specializationId, isActive: true } }); result.specializations.relationsCreated++; }
      else result.specializations.reused++;
    }

    const assignmentTargets = new Map<string, string>(); const assignmentDates = staffAssignmentTargetDates(state.operation.targetAcademicYear);
    for (const source of state.sourceAssignments) {
      let target = state.targetAssignments.find((row: any) => row.staffMemberId === source.staffMemberId);
      if (target && (target.jobRoleId !== source.jobRoleId || target.isPrimary !== source.isPrimary || target.isActive !== source.isActive || !sameDate(target.startDate, assignmentDates.startDate) || target.endDate !== null)) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Target staff assignment is incompatible.');
      if (!target) { target = await db.staffAssignment.create({ data: { institutionId, academicYearId: state.operation.targetAcademicYearId, staffMemberId: source.staffMemberId, jobRoleId: source.jobRoleId, isPrimary: source.isPrimary, isActive: source.isActive, ...assignmentDates, createdBy: actorUserId || null } }); result.staffAssignments.created++; }
      else result.staffAssignments.reused++;
      assignmentTargets.set(source.id, target.id); await ensureMap(db, institutionId, rolloverId, 'STAFF_ASSIGNMENT', source.id, target.id);
      for (const link of source.subjects) { const subjectId = subjectTargets.get(link.subjectId); if (!subjectId) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Staff assignment subject mapping is missing.'); await db.staffAssignmentSubject.upsert({ where: { staffAssignmentId_subjectId: { staffAssignmentId: target.id, subjectId } }, create: { institutionId, staffAssignmentId: target.id, subjectId }, update: {} }); }
    }

    const enrollmentDefaults = enrollmentTargetDefaults(state.operation.targetAcademicYear, state.enrollmentStatuses);
    for (const decision of state.operation.studentDecisions) {
      if (decision.action === 'GRADUATE') { result.decisions.graduated++; continue; }
      if (decision.action === 'SKIP') { result.decisions.skipped++; continue; }
      const targetClassId = classTargets.get(decision.targetClassMappingId); if (!targetClassId) throw new RolloverExecutionError(409, 'ROLLOVER_NOT_READY', 'Student target class is unresolved.', { blockers: ['UNRESOLVED_STUDENT_DECISIONS'] });
      const targetClass = state.targetClasses.find((row: any) => row.id === targetClassId);
      if (!targetClass || targetClass.gradeLevelId !== decision.targetGradeLevelId || (decision.action === 'REPEAT' && decision.targetGradeLevelId !== decision.sourceEnrollment.classRoom?.gradeLevelId && decision.targetGradeLevelId !== state.operation.classMappings.find((row: any) => row.id === decision.targetClassMappingId)?.sourceClass.gradeLevelId)) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_CONFLICT', 'Student decision target class is incompatible.');
      let target = state.targetEnrollments.find((row: any) => row.studentId === decision.studentId);
      if (target && (target.classId !== targetClassId || target.enrollmentStatusId !== enrollmentDefaults.enrollmentStatusId || !sameDate(target.startDate, enrollmentDefaults.startDate) || target.endDate !== null || !target.isActive || target.isDeleted)) throw new RolloverExecutionError(409, 'ROLLOVER_TARGET_ENROLLMENT_CONFLICT', 'Existing target enrollment is incompatible.');
      if (!target) { target = await db.studentEnrollment.create({ data: { institutionId, academicYearId: state.operation.targetAcademicYearId, studentId: decision.studentId, classId: targetClassId, ...enrollmentDefaults } }); result.enrollments.created++; }
      else result.enrollments.reused++;
      result.decisions[decision.action === 'PROMOTE' ? 'promoted' : 'repeated']++;
      await ensureMap(db, institutionId, rolloverId, 'STUDENT_ENROLLMENT', decision.sourceEnrollmentId, target.id);
      await db.studentRolloverDecision.update({ where: { id: decision.id }, data: { targetClassId, targetEnrollmentId: target.id } });
    }

    const policy = { sourceMutated: false, currentYearChanged: false, historicalRecordsCopied: false, studyGroupsCopied: false };
    const completedAt = new Date();
    await recordAuditEvent(db, { institutionId, actorUserId, action: 'ROLLOVER_EXECUTION_COMPLETED', entityType: 'AcademicYearRollover', entityId: rolloverId, metadata: { rolloverId, sourceYearId: state.operation.sourceAcademicYearId, targetYearId: state.operation.targetAcademicYearId, ...result } });
    await db.academicYearRollover.update({ where: { id: rolloverId }, data: { status: 'COMPLETED', completedAt, summary: { result, policy } } });
    await db.$executeRawUnsafe('RELEASE SAVEPOINT rollover_execute');
    return { ...completedResponse({ ...state.operation, status: 'COMPLETED', summary: { result, policy } }, false), result, policy };
  } catch (error) {
    await db.$executeRawUnsafe('ROLLBACK TO SAVEPOINT rollover_execute');
    await db.$executeRawUnsafe('RELEASE SAVEPOINT rollover_execute');
    if (!(error instanceof RolloverExecutionError)) {
      try { await recordAuditEvent(db, { institutionId, actorUserId, action: 'ROLLOVER_EXECUTION_FAILED', entityType: 'AcademicYearRollover', entityId: rolloverId, metadata: { rolloverId } }); } catch { /* best effort */ }
    }
    throw error;
  }
}

function completedResponse(operation: any, alreadyCompleted: boolean) {
  return { rolloverId: operation.id, status: 'COMPLETED' as const, alreadyCompleted, sourceYear: operation.sourceAcademicYear, targetYear: operation.targetAcademicYear, policy: operation.summary?.policy || { sourceMutated: false, currentYearChanged: false, historicalRecordsCopied: false, studyGroupsCopied: false } };
}
