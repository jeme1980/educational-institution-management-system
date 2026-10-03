import type { Response } from 'express';
import * as schemas from '../validation/surveys.schemas';
import { prisma } from '../db/prisma';
import type { AuthRequest } from '../middleware/auth';
import type { ContextRequest } from '../middleware/context';
import { HttpError } from '../middleware/errorHandler.middleware';
import { recordAuditEvent } from '../services/audit.service';
import { assertRoundDates, assertStructureUnlocked, canonicalSurveyCode, duplicateError, requireAcademicYear, requireEditableSurvey, requireSurvey, roundStatuses, surveyDto, surveyStatuses } from '../services/surveys.service';
import { requireSingleXlsxFile, requireSingleXlsxUpload } from '../middleware/xlsx-multipart.middleware';
import { parseSurveyExcelWorkbook, SurveyExcelWorkbookError } from '../services/surveys-excel.parser';
import { validateSurveyExcelWorkbook } from '../services/surveys-excel.validation';
import { previewSurveyExcelSemantics } from '../services/surveys-excel.semantic';
import { executeSurveyExcelImport } from '../services/surveys-excel.import';
import { readSurveyRoundResults } from '../services/surveys-results-read.service';
import { readSurveyTrends } from '../services/surveys-trends.service';
import { readSurveyComparisons } from '../services/surveys-comparisons.service';
import { readSurveyReport } from '../services/surveys-report.service';
import { createSurveyResultsTemplate } from '../services/surveys-excel.template';
import { XLSX_MIME } from '../security/spreadsheet-security';
import type { SurveyExcelSemanticError, SurveyExcelValidatedWorkbook } from '../services/surveys-excel.types';

const institutionOf = (req: ContextRequest) => req.context?.institutionId || req.institutionId || '';
const actorOf = (req: AuthRequest) => req.user?.uid || null;
const param = (req: ContextRequest, name: string) => String(req.params[name] || '');
const optional = (value: any): any => value === undefined ? undefined : value || null;
const audit = (tx: any, req: AuthRequest, action: string, entityType: string, entityId: string, metadata?: unknown) => recordAuditEvent(tx, { institutionId: institutionOf(req), actorUserId: actorOf(req), action, entityType, entityId, metadata });

async function surveyForMutation(req: AuthRequest) { return requireEditableSurvey(institutionOf(req), param(req, 'surveyId')); }
async function ensureSection(institutionId: string, surveyId: string, id: string) { const item = await prisma.surveySection.findFirst({ where: { id, institutionId, surveyId } }); if (!item) throw new HttpError(404, 'Survey section was not found.', 'SURVEY_SECTION_NOT_FOUND'); return item; }
async function ensureDomain(institutionId: string, surveyId: string, id: string) { const item = await prisma.surveyDomain.findFirst({ where: { id, institutionId, surveyId } }); if (!item) throw new HttpError(404, 'Survey domain was not found.', 'SURVEY_DOMAIN_NOT_FOUND'); return item; }
async function ensureIndicator(institutionId: string, surveyId: string, id: string) { const item = await prisma.surveyIndicator.findFirst({ where: { id, institutionId, surveyId } }); if (!item) throw new HttpError(404, 'Survey indicator was not found.', 'SURVEY_INDICATOR_NOT_FOUND'); return item; }
async function ensureRound(institutionId: string, surveyId: string, id: string) { const item = await prisma.surveyRound.findFirst({ where: { id, institutionId, surveyId } }); if (!item) throw new HttpError(404, 'Survey round was not found.', 'SURVEY_ROUND_NOT_FOUND'); return item; }
async function ensureSegment(institutionId: string, surveyId: string, id: string) { const item = await prisma.surveySegment.findFirst({ where: { id, institutionId, surveyId } }); if (!item) throw new HttpError(404, 'Survey segment was not found.', 'SURVEY_SEGMENT_NOT_FOUND'); return item; }
function identityChanged(existing: any, body: any, fields: string[]) { return fields.some((field) => body[field] !== undefined && body[field] !== existing[field]); }
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const previewSummary = (workbook: SurveyExcelValidatedWorkbook | null, errorCount: number) => ({
  indicatorRowsTotal: workbook?.indicatorResults.length ?? 0,
  indicatorRowsValid: 0,
  domainRowsTotal: workbook?.domainResults.length ?? 0,
  domainRowsValid: 0,
  comparisonRowsTotal: workbook?.comparisons.length ?? 0,
  comparisonRowsValid: 0,
  participationRowsTotal: workbook?.participation.length ?? 0,
  participationRowsValid: 0,
  errorCount,
});
const publicPreviewErrors = (errors: Array<{ sheet: string; row: number; column: string; code: string; message: string }>) => errors.map(({ sheet, row, column, code, message }) => ({ sheet, row, column, code, message }));
const contextFailure = (error: SurveyExcelSemanticError): HttpError => {
  const status = error.code === 'SURVEY_ARCHIVED' ? 409 : 404;
  return new HttpError(status, error.message, error.code);
};

export async function listSurveys(req: ContextRequest, res: Response) {
  const institutionId = institutionOf(req); const academicYearId = String(req.query.academicYearId || '');
  if (!academicYearId) throw new HttpError(400, 'academicYearId is required.', 'ACADEMIC_YEAR_NOT_FOUND');
  await requireAcademicYear(institutionId, academicYearId);
  // Listing archived records is deliberately deferred until an explicit management-read contract exists.
  const includeArchived = false;
  const items = await prisma.survey.findMany({ where: { institutionId, academicYearId, ...(includeArchived ? {} : { archivedAt: null }) }, include: { _count: { select: { sections: true, domains: true, indicators: true, rounds: true, segments: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  res.json(items.map((item) => surveyDto(item, { sectionCount: item._count.sections, domainCount: item._count.domains, indicatorCount: item._count.indicators, roundCount: item._count.rounds, segmentCount: item._count.segments })));
}
export async function downloadSurveyResultsTemplate(_req: ContextRequest, res: Response) {
  const buffer = await createSurveyResultsTemplate();
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', 'attachment; filename="survey-results-template.xlsx"');
  res.send(buffer);
}
export async function createSurvey(req: AuthRequest, res: Response) {
  const institutionId = institutionOf(req); const body: any = req.body; await requireAcademicYear(institutionId, body.academicYearId);
  const value = await prisma.$transaction(async (tx) => { const created = await tx.survey.create({ data: { institutionId, academicYearId: body.academicYearId, nameAr: body.nameAr, nameHe: optional(body.nameHe), descriptionAr: optional(body.descriptionAr), descriptionHe: optional(body.descriptionHe), audienceType: optional(body.audienceType), status: body.status || 'DRAFT' } }); await audit(tx, req, 'SURVEY_CREATED', 'Survey', created.id); return created; });
  res.status(201).json(surveyDto(value));
}
export async function getSurvey(req: ContextRequest, res: Response) { res.json(surveyDto(await requireSurvey(institutionOf(req), param(req, 'surveyId'), true))); }
export async function updateSurvey(req: AuthRequest, res: Response) {
  const existing = await surveyForMutation(req); const body: any = req.body;
  if (body.status && !surveyStatuses.has(body.status)) throw new HttpError(400, 'Invalid survey status.', 'INVALID_SURVEY_STATUS');
  if (existing.status === 'CLOSED' && body.status && body.status !== 'CLOSED') throw new HttpError(409, 'Closed surveys cannot be reopened.', 'INVALID_SURVEY_STATUS');
  if ((existing.status === 'DRAFT' && body.status && !['DRAFT', 'ACTIVE'].includes(body.status)) || (existing.status === 'ACTIVE' && body.status && !['ACTIVE', 'CLOSED'].includes(body.status))) throw new HttpError(409, 'Invalid survey status transition.', 'INVALID_SURVEY_STATUS');
  const value = await prisma.$transaction(async (tx) => { const updated = await tx.survey.update({ where: { id: existing.id }, data: { ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}), ...(body.nameHe !== undefined ? { nameHe: optional(body.nameHe) } : {}), ...(body.descriptionAr !== undefined ? { descriptionAr: optional(body.descriptionAr) } : {}), ...(body.descriptionHe !== undefined ? { descriptionHe: optional(body.descriptionHe) } : {}), ...(body.audienceType !== undefined ? { audienceType: optional(body.audienceType) } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}), ...(body.status !== undefined ? { status: body.status } : {}) } }); await audit(tx, req, 'SURVEY_UPDATED', 'Survey', updated.id); return updated; }); res.json(surveyDto(value));
}
export async function archiveSurvey(req: AuthRequest, res: Response) { const survey = await requireSurvey(institutionOf(req), param(req, 'surveyId'), true); const value = survey.archivedAt ? survey : await prisma.$transaction(async (tx) => { const updated = await tx.survey.update({ where: { id: survey.id }, data: { archivedAt: new Date() } }); await audit(tx, req, 'SURVEY_ARCHIVED', 'Survey', updated.id); return updated; }); res.json(surveyDto(value)); }
export async function getStructure(req: ContextRequest, res: Response) {
  const survey = await requireSurvey(institutionOf(req), param(req, 'surveyId'), true);
  const structure = await prisma.survey.findUniqueOrThrow({ where: { id: survey.id }, include: { sections: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { domains: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { indicators: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } } } }, rounds: { orderBy: [{ sequenceNumber: 'asc' }, { measurementDate: 'asc' }, { id: 'asc' }] }, segments: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } });
  res.json({ survey: surveyDto(structure), sections: structure.sections, rounds: structure.rounds, segments: structure.segments });
}
export async function getSurveyRoundResults(req: ContextRequest, res: Response) {
  const surveyId = param(req, 'surveyId');
  const roundId = param(req, 'roundId');
  if (!schemas.surveyRoundResultsParamsSchema.shape.surveyId.safeParse(surveyId).success) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
  if (!schemas.surveyRoundResultsParamsSchema.shape.roundId.safeParse(roundId).success) throw new HttpError(404, 'Survey round was not found.', 'SURVEY_ROUND_NOT_FOUND');
  res.json(await readSurveyRoundResults(institutionOf(req), surveyId, roundId));
}
export async function getSurveyTrends(req: ContextRequest, res: Response) {
  const surveyId = param(req, 'surveyId');
  if (!schemas.surveyRoundResultsParamsSchema.shape.surveyId.safeParse(surveyId).success) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
  res.json(await readSurveyTrends(institutionOf(req), surveyId));
}
export async function getSurveyComparisons(req: ContextRequest, res: Response) {
  const surveyId = param(req, 'surveyId');
  if (!schemas.surveyRoundResultsParamsSchema.shape.surveyId.safeParse(surveyId).success) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
  res.json(await readSurveyComparisons(institutionOf(req), surveyId));
}
export async function getSurveyReport(req: ContextRequest, res: Response) {
  const surveyId = param(req, 'surveyId');
  if (!schemas.surveyRoundResultsParamsSchema.shape.surveyId.safeParse(surveyId).success) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
  const roundId = req.query.roundId;
  const segmentId = req.query.segmentId;
  if (roundId !== undefined && !schemas.surveyRoundResultsParamsSchema.shape.roundId.safeParse(roundId).success) throw new HttpError(404, 'Survey round was not found.', 'SURVEY_ROUND_NOT_FOUND');
  if (segmentId !== undefined && !schemas.surveyRoundResultsParamsSchema.shape.roundId.safeParse(segmentId).success) throw new HttpError(404, 'Survey segment was not found.', 'SURVEY_SEGMENT_NOT_FOUND');
  res.json(await readSurveyReport(institutionOf(req), surveyId, roundId as string | undefined, segmentId as string | undefined));
}
export async function previewSurveyResults(req: AuthRequest, res: Response) {
  const institutionId = institutionOf(req);
  const surveyId = param(req, 'surveyId');
  const roundId = param(req, 'roundId');
  if (!uuid(surveyId)) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
  if (!uuid(roundId)) throw new HttpError(404, 'Survey round was not found.', 'SURVEY_ROUND_NOT_FOUND');
  const file = requireSingleXlsxFile(req);
  let parsed;
  try {
    parsed = await parseSurveyExcelWorkbook(file);
  } catch (error) {
    if (!(error instanceof SurveyExcelWorkbookError)) throw error;
    const malformed = error.errors.find((item) => item.code === 'MALFORMED_WORKBOOK');
    if (malformed) throw new HttpError(400, malformed.message, malformed.code);
    return res.json({ valid: false, context: { surveyId, roundId }, summary: previewSummary(null, error.errors.length), errors: publicPreviewErrors(error.errors) });
  }
  const syntactic = validateSurveyExcelWorkbook(parsed);
  if (syntactic.errors.length) {
    return res.json({ valid: false, context: { surveyId, roundId }, summary: previewSummary(syntactic.workbook, syntactic.errors.length), errors: publicPreviewErrors(syntactic.errors) });
  }
  const semantic = await previewSurveyExcelSemantics({ institutionId, surveyId, roundId, workbook: syntactic.workbook });
  const fatal = semantic.errors.find((error) => error.scope === 'CONTEXT');
  if (fatal) throw contextFailure(fatal);
  return res.json({
    valid: semantic.errors.length === 0,
    context: { surveyId: semantic.survey?.id || surveyId, roundId: semantic.round?.id || roundId },
    summary: semantic.summary,
    errors: publicPreviewErrors(semantic.errors),
  });
}
export async function importSurveyResults(req: AuthRequest, res: Response) {
  const institutionId = institutionOf(req);
  const surveyId = param(req, 'surveyId');
  const roundId = param(req, 'roundId');
  if (!uuid(surveyId)) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
  if (!uuid(roundId)) throw new HttpError(404, 'Survey round was not found.', 'SURVEY_ROUND_NOT_FOUND');
  const userId = req.user?.uid;
  if (!userId) throw new HttpError(401, 'Authentication is required.', 'AUTHENTICATION_REQUIRED');
  const upload = requireSingleXlsxUpload(req);
  let parsed;
  try {
    parsed = await parseSurveyExcelWorkbook(upload.buffer);
  } catch (error) {
    if (!(error instanceof SurveyExcelWorkbookError)) throw error;
    throw new HttpError(400, 'The spreadsheet cannot be imported.', 'SURVEY_IMPORT_PREVIEW_INVALID', { errors: publicPreviewErrors(error.errors) });
  }
  const syntactic = validateSurveyExcelWorkbook(parsed);
  if (syntactic.errors.length) {
    throw new HttpError(400, 'The spreadsheet cannot be imported.', 'SURVEY_IMPORT_PREVIEW_INVALID', { errors: publicPreviewErrors(syntactic.errors) });
  }
  const semantic = await previewSurveyExcelSemantics({ institutionId, surveyId, roundId, workbook: syntactic.workbook });
  const fatal = semantic.errors.find((error) => error.scope === 'CONTEXT');
  if (fatal) throw contextFailure(fatal);
  if (semantic.errors.length) {
    throw new HttpError(400, 'The spreadsheet cannot be imported.', 'SURVEY_IMPORT_PREVIEW_INVALID', { errors: publicPreviewErrors(semantic.errors) });
  }
  const result = await executeSurveyExcelImport({
    institutionId,
    surveyId,
    roundId,
    userId,
    originalFileName: upload.originalFileName,
    fileBuffer: upload.buffer,
    preview: semantic,
  });
  res.status(201).json({
    importBatchId: result.importBatchId,
    surveyId: result.surveyId,
    roundId: result.roundId,
    status: result.status,
    rowCount: result.rowCount,
    validRowCount: result.validRowCount,
    invalidRowCount: result.invalidRowCount,
    fileHash: result.fileHash,
    importedAt: result.importedAt,
  });
}
export async function createSection(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const body: any = req.body; try { const value = await prisma.$transaction(async (tx) => { const created = await tx.surveySection.create({ data: { institutionId: survey.institutionId, surveyId: survey.id, code: canonicalSurveyCode(body.code), nameAr: body.nameAr, nameHe: optional(body.nameHe), descriptionAr: optional(body.descriptionAr), descriptionHe: optional(body.descriptionHe), sortOrder: body.sortOrder ?? 0, isOptional: body.isOptional ?? false, isActive: body.isActive ?? true } }); await audit(tx, req, 'SURVEY_SECTION_CREATED', 'SurveySection', created.id); return created; }); res.status(201).json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_SECTION_CODE'); } }
export async function updateSection(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const existing = await ensureSection(survey.institutionId, survey.id, param(req, 'sectionId')); const body: any = req.body; await assertStructureUnlocked(survey.id, identityChanged(existing, body, ['code'])); try { const value = await prisma.$transaction(async (tx) => { const updated = await tx.surveySection.update({ where: { id: existing.id }, data: { ...(body.code !== undefined ? { code: canonicalSurveyCode(body.code) } : {}), ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}), ...(body.nameHe !== undefined ? { nameHe: optional(body.nameHe) } : {}), ...(body.descriptionAr !== undefined ? { descriptionAr: optional(body.descriptionAr) } : {}), ...(body.descriptionHe !== undefined ? { descriptionHe: optional(body.descriptionHe) } : {}), ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}), ...(body.isOptional !== undefined ? { isOptional: body.isOptional } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) } }); await audit(tx, req, 'SURVEY_SECTION_UPDATED', 'SurveySection', updated.id); return updated; }); res.json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_SECTION_CODE'); } }
export async function createDomain(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const body: any = req.body; await ensureSection(survey.institutionId, survey.id, body.sectionId); try { const value = await prisma.$transaction(async (tx) => { const created = await tx.surveyDomain.create({ data: { institutionId: survey.institutionId, surveyId: survey.id, sectionId: body.sectionId, code: canonicalSurveyCode(body.code), nameAr: body.nameAr, nameHe: optional(body.nameHe), descriptionAr: optional(body.descriptionAr), descriptionHe: optional(body.descriptionHe), sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true } }); await audit(tx, req, 'SURVEY_DOMAIN_CREATED', 'SurveyDomain', created.id); return created; }); res.status(201).json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_DOMAIN_CODE'); } }
export async function updateDomain(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const existing = await ensureDomain(survey.institutionId, survey.id, param(req, 'domainId')); const body: any = req.body; if (body.sectionId !== undefined) await ensureSection(survey.institutionId, survey.id, body.sectionId); await assertStructureUnlocked(survey.id, identityChanged(existing, body, ['sectionId', 'code'])); try { const value = await prisma.$transaction(async (tx) => { const updated = await tx.surveyDomain.update({ where: { id: existing.id }, data: { ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}), ...(body.code !== undefined ? { code: canonicalSurveyCode(body.code) } : {}), ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}), ...(body.nameHe !== undefined ? { nameHe: optional(body.nameHe) } : {}), ...(body.descriptionAr !== undefined ? { descriptionAr: optional(body.descriptionAr) } : {}), ...(body.descriptionHe !== undefined ? { descriptionHe: optional(body.descriptionHe) } : {}), ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) } }); await audit(tx, req, 'SURVEY_DOMAIN_UPDATED', 'SurveyDomain', updated.id); return updated; }); res.json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_DOMAIN_CODE'); } }
export async function createIndicator(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const body: any = req.body; await ensureDomain(survey.institutionId, survey.id, body.domainId); try { const value = await prisma.$transaction(async (tx) => { const created = await tx.surveyIndicator.create({ data: { institutionId: survey.institutionId, surveyId: survey.id, domainId: body.domainId, code: canonicalSurveyCode(body.code), textAr: body.textAr, textHe: optional(body.textHe), descriptionAr: optional(body.descriptionAr), descriptionHe: optional(body.descriptionHe), sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true, reportingRuleCode: optional(body.reportingRuleCode), isReverseDirection: body.isReverseDirection ?? false } }); await audit(tx, req, 'SURVEY_INDICATOR_CREATED', 'SurveyIndicator', created.id); return created; }); res.status(201).json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_INDICATOR_CODE'); } }
export async function updateIndicator(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const existing = await ensureIndicator(survey.institutionId, survey.id, param(req, 'indicatorId')); const body: any = req.body; if (body.domainId !== undefined) await ensureDomain(survey.institutionId, survey.id, body.domainId); await assertStructureUnlocked(survey.id, identityChanged(existing, body, ['domainId', 'code', 'textAr', 'textHe', 'reportingRuleCode', 'isReverseDirection'])); try { const value = await prisma.$transaction(async (tx) => { const updated = await tx.surveyIndicator.update({ where: { id: existing.id }, data: { ...(body.domainId !== undefined ? { domainId: body.domainId } : {}), ...(body.code !== undefined ? { code: canonicalSurveyCode(body.code) } : {}), ...(body.textAr !== undefined ? { textAr: body.textAr } : {}), ...(body.textHe !== undefined ? { textHe: optional(body.textHe) } : {}), ...(body.descriptionAr !== undefined ? { descriptionAr: optional(body.descriptionAr) } : {}), ...(body.descriptionHe !== undefined ? { descriptionHe: optional(body.descriptionHe) } : {}), ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}), ...(body.reportingRuleCode !== undefined ? { reportingRuleCode: optional(body.reportingRuleCode) } : {}), ...(body.isReverseDirection !== undefined ? { isReverseDirection: body.isReverseDirection } : {}) } }); await audit(tx, req, 'SURVEY_INDICATOR_UPDATED', 'SurveyIndicator', updated.id); return updated; }); res.json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_INDICATOR_CODE'); } }
export async function createRound(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const body: any = req.body; const year = await requireAcademicYear(survey.institutionId, survey.academicYearId); assertRoundDates(body, year); try { const value = await prisma.$transaction(async (tx) => { const closed = body.status === 'CLOSED'; const created = await tx.surveyRound.create({ data: { institutionId: survey.institutionId, academicYearId: survey.academicYearId, surveyId: survey.id, code: canonicalSurveyCode(body.code), nameAr: body.nameAr, nameHe: optional(body.nameHe), sequenceNumber: body.sequenceNumber, startsAt: optional(body.startsAt), endsAt: optional(body.endsAt), measurementDate: optional(body.measurementDate), status: body.status || 'PLANNED', closedAt: closed ? new Date() : null } }); await audit(tx, req, 'SURVEY_ROUND_CREATED', 'SurveyRound', created.id); return created; }); res.status(201).json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_ROUND_CODE'); } }
export async function updateRound(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const existing = await ensureRound(survey.institutionId, survey.id, param(req, 'roundId')); const body: any = req.body; const year = await requireAcademicYear(survey.institutionId, survey.academicYearId); const dates = { startsAt: body.startsAt === undefined ? existing.startsAt : body.startsAt, endsAt: body.endsAt === undefined ? existing.endsAt : body.endsAt, measurementDate: body.measurementDate === undefined ? existing.measurementDate : body.measurementDate }; assertRoundDates(dates, year); await assertStructureUnlocked(survey.id, identityChanged(existing, body, ['code', 'sequenceNumber'])); try { const value = await prisma.$transaction(async (tx) => { const status = body.status ?? existing.status; if (!roundStatuses.has(status)) throw new HttpError(400, 'Invalid round status.', 'INVALID_SURVEY_STATUS'); const updated = await tx.surveyRound.update({ where: { id: existing.id }, data: { ...(body.code !== undefined ? { code: canonicalSurveyCode(body.code) } : {}), ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}), ...(body.nameHe !== undefined ? { nameHe: optional(body.nameHe) } : {}), ...(body.sequenceNumber !== undefined ? { sequenceNumber: body.sequenceNumber } : {}), ...(body.startsAt !== undefined ? { startsAt: optional(body.startsAt) } : {}), ...(body.endsAt !== undefined ? { endsAt: optional(body.endsAt) } : {}), ...(body.measurementDate !== undefined ? { measurementDate: optional(body.measurementDate) } : {}), ...(body.status !== undefined ? { status, closedAt: status === 'CLOSED' ? existing.closedAt || new Date() : existing.closedAt } : {}) } }); await audit(tx, req, 'SURVEY_ROUND_UPDATED', 'SurveyRound', updated.id); return updated; }); res.json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_ROUND_CODE'); } }
export async function createSegment(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const body: any = req.body; try { const value = await prisma.$transaction(async (tx) => { const created = await tx.surveySegment.create({ data: { institutionId: survey.institutionId, surveyId: survey.id, code: canonicalSurveyCode(body.code), nameAr: body.nameAr, nameHe: optional(body.nameHe), segmentType: optional(body.segmentType), sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true } }); await audit(tx, req, 'SURVEY_SEGMENT_CREATED', 'SurveySegment', created.id); return created; }); res.status(201).json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_SEGMENT_CODE'); } }
export async function updateSegment(req: AuthRequest, res: Response) { const survey = await surveyForMutation(req); const existing = await ensureSegment(survey.institutionId, survey.id, param(req, 'segmentId')); const body: any = req.body; await assertStructureUnlocked(survey.id, identityChanged(existing, body, ['code'])); try { const value = await prisma.$transaction(async (tx) => { const updated = await tx.surveySegment.update({ where: { id: existing.id }, data: { ...(body.code !== undefined ? { code: canonicalSurveyCode(body.code) } : {}), ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}), ...(body.nameHe !== undefined ? { nameHe: optional(body.nameHe) } : {}), ...(body.segmentType !== undefined ? { segmentType: optional(body.segmentType) } : {}), ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) } }); await audit(tx, req, 'SURVEY_SEGMENT_UPDATED', 'SurveySegment', updated.id); return updated; }); res.json(value); } catch (error) { throw duplicateError(error, 'DUPLICATE_SURVEY_SEGMENT_CODE'); } }
