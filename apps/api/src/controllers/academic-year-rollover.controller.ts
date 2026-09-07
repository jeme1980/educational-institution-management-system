import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { previewAcademicYearRollover, RolloverPreviewError } from '../services/academic-year-rollover-preview.service';
import { createRolloverDraft, getRolloverDraft, RolloverDraftError } from '../services/academic-year-rollover-draft.service';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';
import { classMappingPatchData, classMappingValidationStatus } from '../services/academic-year-rollover-contracts';
import { executeAcademicYearRollover, RolloverExecutionError } from '../services/academic-year-rollover-execution.service';

export async function previewAcademicYearRolloverController(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  try {
    const result = await previewAcademicYearRollover(institutionId, req.body);
    return res.json(result);
  } catch (error) {
    if (error instanceof RolloverPreviewError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}

function draftError(res: Response, error: unknown) {
  if (error instanceof RolloverDraftError) return res.status(error.status).json({ error: error.message, code: error.code, ...error.metadata });
  if (error instanceof RolloverPreviewError) return res.status(error.status).json({ error: error.message, code: error.code });
  throw error;
}

export async function createAcademicYearRolloverDraftController(req: ContextRequest, res: Response): Promise<any> {
  try {
    const draft = await createRolloverDraft(req.context?.institutionId || '', req.user?.uid, req.body);
    return res.status(201).json({ operation: draft });
  } catch (error) { return draftError(res, error); }
}

export async function getAcademicYearRolloverDraftController(req: ContextRequest, res: Response): Promise<any> {
  try { return res.json(await getRolloverDraft(req.context?.institutionId || '', String(req.params['rolloverId']))); }
  catch (error) { return draftError(res, error); }
}

export async function executeAcademicYearRolloverController(req: ContextRequest, res: Response): Promise<any> {
  try {
    const result = await executeAcademicYearRollover(req.context?.institutionId || '', String(req.params['rolloverId']), req.body.executionPlanFingerprint, req.user?.uid, { db: req.db || prisma });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof RolloverExecutionError) return res.status(error.status).json({ error: error.message, code: error.code, ...error.metadata });
    throw error;
  }
}

export async function patchAcademicYearRolloverClassMappingController(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || ''; const rolloverId = String(req.params['rolloverId']); const mappingId = String(req.params['mappingId']); const body = req.body;
  const mapping: any = await prisma.academicYearRolloverClassMapping.findFirst({ where: { id: mappingId, rolloverId, institutionId }, include: { rollover: true } });
  if (!mapping) return res.status(404).json({ error: 'Class mapping was not found.', code: 'CLASS_MAPPING_NOT_FOUND' });
  if (body.action === 'CREATE') {
    if (classMappingValidationStatus(body) !== 'VALID') return res.status(400).json({ error: 'CREATE requires a valid stage, grade, parallel number, and Arabic class name, with no target class.', code: 'INVALID_CLASS_MAPPING' });
    const [stage, grade] = await Promise.all([
      prisma.educationStage.findFirst({ where: { id: body.targetStageId, isActive: true }, select: { id: true } }),
      prisma.gradeLevel.findFirst({ where: { id: body.targetGradeLevelId, isActive: true }, select: { id: true } }),
    ]);
    if (!stage || !grade) return res.status(400).json({ error: 'Target stage and grade must be active.', code: 'INVALID_CLASS_MAPPING' });
  }
  if (body.action === 'USE_EXISTING') {
    const target = body.targetClassId && await prisma.class.findFirst({ where: { id: body.targetClassId, institutionId, academicYearId: mapping.rollover.targetAcademicYearId, archivedAt: null } });
    if (!target) return res.status(400).json({ error: 'Target class must belong to this institution and target academic year.', code: 'INVALID_TARGET_CLASS' });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const data = classMappingPatchData(body);
    const row = await tx.academicYearRolloverClassMapping.update({ where: { id: mapping.id }, data });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'ROLLOVER_CLASS_MAPPING_UPDATED', entityType: 'AcademicYearRolloverClassMapping', entityId: row.id, metadata: { rolloverId, sourceYearId: mapping.rollover.sourceAcademicYearId, targetYearId: mapping.rollover.targetAcademicYearId } });
    return row;
  });
  return res.json({ mapping: updated });
}

async function updateDecision(institutionId: string, rolloverId: string, decisionId: string, body: any, actorUserId?: string) {
  const decision: any = await prisma.studentRolloverDecision.findFirst({ where: { id: decisionId, rolloverId, institutionId }, include: { rollover: true, sourceEnrollment: { include: { classRoom: true } } } });
  if (!decision) throw new RolloverDraftError(404, 'STUDENT_DECISION_NOT_FOUND', 'Student decision was not found.');
  const action = body.action; let mapping: any = null;
  if (['PROMOTE', 'REPEAT'].includes(action)) {
    if (!body.targetClassMappingId || !body.targetGradeLevelId) throw new RolloverDraftError(400, 'INVALID_STUDENT_DECISION', 'Promotion and repeat decisions require a target grade and class mapping.');
    mapping = await prisma.academicYearRolloverClassMapping.findFirst({ where: { id: body.targetClassMappingId, rolloverId, institutionId } });
    if (!mapping || !['CREATE', 'USE_EXISTING'].includes(mapping.action) || classMappingValidationStatus(mapping) !== 'VALID') throw new RolloverDraftError(400, 'INVALID_CLASS_MAPPING', 'Student decision requires a valid class mapping from this rollover.');
    if (action === 'REPEAT' && body.targetGradeLevelId !== decision.sourceEnrollment.classRoom.gradeLevelId) throw new RolloverDraftError(400, 'INVALID_REPEAT_GRADE', 'Repeat decisions must use the source grade.');
  }
  return prisma.$transaction(async (tx) => {
    const needsTarget = ['PROMOTE', 'REPEAT'].includes(action);
    const row = await tx.studentRolloverDecision.update({ where: { id: decision.id }, data: { action, targetGradeLevelId: needsTarget ? body.targetGradeLevelId : null, targetClassMappingId: needsTarget ? mapping.id : null, targetClassId: needsTarget ? mapping.targetClassId : null, targetAcademicYearId: needsTarget ? decision.rollover.targetAcademicYearId : null, targetEnrollmentId: null, validationStatus: action ? 'VALID' : 'UNRESOLVED', warnings: [] } });
    await recordAuditEvent(tx, { institutionId, actorUserId, action: 'ROLLOVER_STUDENT_DECISION_UPDATED', entityType: 'StudentRolloverDecision', entityId: row.id, metadata: { rolloverId, sourceYearId: decision.rollover.sourceAcademicYearId, targetYearId: decision.rollover.targetAcademicYearId } });
    return row;
  });
}

export async function patchAcademicYearRolloverStudentDecisionController(req: ContextRequest, res: Response): Promise<any> {
  try { return res.json({ decision: await updateDecision(req.context?.institutionId || '', String(req.params['rolloverId']), String(req.params['decisionId']), req.body, req.user?.uid) }); }
  catch (error) { return draftError(res, error); }
}

export async function bulkPatchAcademicYearRolloverStudentDecisionsController(req: ContextRequest, res: Response): Promise<any> {
  try {
    const { decisionIds, ...body } = req.body; const institutionId = req.context?.institutionId || ''; const rolloverId = String(req.params['rolloverId']);
    const decisions = await prisma.studentRolloverDecision.findMany({ where: { id: { in: decisionIds }, rolloverId, institutionId }, select: { id: true } });
    if (decisions.length !== decisionIds.length) throw new RolloverDraftError(404, 'STUDENT_DECISION_NOT_FOUND', 'One or more student decisions were not found.');
    const updated = []; for (const decision of decisions) updated.push(await updateDecision(institutionId, rolloverId, decision.id, body, req.user?.uid));
    await recordAuditEvent(prisma, { institutionId, actorUserId: req.user?.uid, action: 'ROLLOVER_STUDENT_DECISIONS_BULK_UPDATED', entityType: 'AcademicYearRollover', entityId: rolloverId, metadata: { rolloverId, decisionCount: updated.length } });
    return res.json({ updatedCount: updated.length, decisions: updated });
  } catch (error) { return draftError(res, error); }
}
