import { Response } from 'express';
import type { SubscriptionStatus } from '@prisma/client';
import type { ContextRequest } from '../middleware/context';
import { platformPrisma } from '../db/platform-prisma';
import { recordPlatformAuditEvent } from '../services/platform-audit.service';
import { assignPlatformSubscription, renewPlatformSubscription, transitionPlatformSubscription } from '../services/platform-subscription.service';
import { getEffectiveSubscriptionState, getPlatformEffectiveSubscriptionState } from '../services/subscription.service';
import { lockPlatformInstitutions, lockPlatformPlan } from '../services/platform-plan-coordination.service';
import { getInstitutionUsage, getReferenceDependencyCounts, type PlatformReferenceDependencyKind } from '../db/platform-metrics.repository';
import { getInitialAdminStatus, provisionInitialSchoolAdmin, reissueInitialAdminSetup, revokeInitialAdminSetup } from '../services/school-onboarding.service';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const current = { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as SubscriptionStatus[] } };
const errorResponse = (res: Response, error: any) => {
  if (error?.code === 'P2002') { res.status(409).json({ error: 'A record with the same unique code or slug already exists.' }); return; }
  if (error?.code === 'P2003') { res.status(409).json({ code: 'REFERENCE_IN_USE', error: 'The reference record is still in use.' }); return; }
  if (error?.code === 'P2025') { res.status(404).json({ error: 'Reference or platform record not found.' }); return; }
  const statusCode = Number(error?.statusCode);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    res.status(statusCode).json({ error: error?.message || 'Platform operation failed.', ...(error?.code ? { code: error.code } : {}), ...(error?.field ? { field: error.field } : {}), ...(error?.currentUsage !== undefined ? { currentUsage: error.currentUsage } : {}) });
    return;
  }
  throw error;
};

type ReferenceValidationError = { message: string; fieldErrors: Record<string, string> };

const providerInput = (body: Record<string, unknown>, partial = false) => {
  const data: { providerCode?: string; name?: string; isActive?: boolean; sortOrder?: number } = {};
  if (!partial || body.providerCode !== undefined) data.providerCode = String(body.providerCode || '').trim();
  if (!partial || body.name !== undefined) data.name = String(body.name || '').trim();
  if (!partial || body.isActive !== undefined) data.isActive = body.isActive !== false;
  if (!partial || body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder ?? 0);
  return data;
};

/** The platform owns only these global reference tables. Keep this allowlist
 * explicit: callers must never be able to turn a request parameter into a
 * Prisma delegate. */
export const PLATFORM_REFERENCE_TABLES = {
  regions: 'region',
  towns: 'town',
  languages: 'language',
  educationTypes: 'educationType',
  educationStages: 'educationStage',
  gradeLevels: 'gradeLevel',
  classTypes: 'classType',
  compositionTypes: 'compositionType',
  genders: 'gender',
  studentStatuses: 'studentStatus',
  enrollmentStatuses: 'enrollmentStatus',
  relationTypes: 'relationType',
  studentFeatures: 'studentFeature',
  providers: 'provider',
  institutionStatuses: 'institutionStatus',
} as const;

type PlatformReferenceKey = keyof typeof PLATFORM_REFERENCE_TABLES;
const PLATFORM_MUTABLE_REFERENCE_TABLES = new Set<PlatformReferenceKey>([
  'regions', 'towns', 'languages', 'educationTypes', 'educationStages', 'gradeLevels',
  'classTypes', 'compositionTypes', 'genders', 'studentStatuses', 'enrollmentStatuses',
  'relationTypes', 'studentFeatures', 'providers',
]);

const REFERENCE_DISPLAY_FIELDS: Partial<Record<PlatformReferenceKey, readonly string[]>> = {
  regions: ['nameAr', 'nameHe', 'sortOrder', 'isActive'],
  towns: ['nameAr', 'nameHe', 'regionId'],
  languages: ['nameAr', 'nameHe', 'nativeName', 'direction', 'sortOrder'],
  educationTypes: ['nameAr', 'nameHe', 'sortOrder'],
  educationStages: ['nameAr', 'nameHe', 'sortOrder'],
  gradeLevels: ['nameAr', 'nameHe', 'sortOrder', 'isActive'],
  classTypes: ['nameAr', 'nameHe', 'sortOrder'],
  compositionTypes: ['nameAr', 'nameHe', 'sortOrder'],
  genders: ['nameAr', 'nameHe', 'sortOrder', 'isActive'],
  studentStatuses: ['nameAr', 'nameHe', 'isFinalStatus', 'sortOrder', 'isActive'],
  enrollmentStatuses: ['nameAr', 'nameHe', 'isFinalStatus', 'sortOrder', 'isActive'],
  relationTypes: ['nameAr', 'nameHe', 'sortOrder', 'isActive'],
  studentFeatures: ['nameAr', 'nameHe'],
  providers: ['name', 'sortOrder', 'isActive'],
};

const platformReferenceKey = (value: unknown): value is PlatformReferenceKey =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLATFORM_REFERENCE_TABLES, value);

const platformReferenceData = (key: PlatformReferenceKey, body: Record<string, unknown>, partial = false): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  const text = (value: unknown) => {
    const result = String(value ?? '').trim();
    return result || null;
  };
  if (key === 'providers') {
    if (!partial || body.providerCode !== undefined) data.providerCode = text(body.providerCode);
    if (!partial || body.name !== undefined) data.name = text(body.name);
    if (!partial || body.isActive !== undefined) data.isActive = body.isActive !== false;
    if (!partial || body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder ?? 0);
    return data;
  }
  if (!partial || body.nameAr !== undefined) data.nameAr = text(body.nameAr);
  if (!partial || body.nameHe !== undefined) data.nameHe = text(body.nameHe);
  if (key !== 'towns' && key !== 'studentFeatures') {
    if (!partial || body.isActive !== undefined) data.isActive = body.isActive !== false;
    if (!partial || body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder ?? 0);
  }
  if (key === 'towns' && body.regionId !== undefined) data.regionId = text(body.regionId);
  if (key === 'languages') {
    if (!partial || body.nativeName !== undefined) data.nativeName = text(body.nativeName);
    if (!partial || body.direction !== undefined) data.direction = text(body.direction) || 'rtl';
  }
  if (key === 'gradeLevels' && body.codeNumber !== undefined) data.codeNumber = Number(body.codeNumber);
  if (key === 'genders' && body.genderCode !== undefined) data.genderCode = text(body.genderCode)?.toLowerCase();
  if (key === 'studentStatuses' || key === 'enrollmentStatuses') {
    if (!partial || body.isFinalStatus !== undefined) data.isFinalStatus = body.isFinalStatus === true;
  }
  return data;
};

const validatePlatformReferenceData = async (key: PlatformReferenceKey, data: Record<string, unknown>, partial: boolean): Promise<ReferenceValidationError | null> => {
  const invalid = (message: string, field: string): ReferenceValidationError => ({ message, fieldErrors: { [field]: message } });
  if ((!partial || data.nameAr !== undefined) && key !== 'providers' && !data.nameAr) return invalid('Arabic name is required.', 'nameAr');
  if (key === 'providers') {
    if ((!partial || data.providerCode !== undefined) && (!data.providerCode || String(data.providerCode).length > 20)) return invalid(data.providerCode ? 'Provider code must be 20 characters or fewer.' : 'Provider code is required.', 'providerCode');
    if ((!partial || data.name !== undefined) && (!data.name || String(data.name).length > 150)) return invalid(data.name ? 'Provider name must be 150 characters or fewer.' : 'Provider name is required.', 'name');
  }
  if (data.sortOrder !== undefined && (!Number.isInteger(data.sortOrder) || Number(data.sortOrder) < 0)) return invalid('Sort order must be a non-negative integer.', 'sortOrder');
  if (key === 'languages' && data.direction !== undefined && !['rtl', 'ltr'].includes(String(data.direction))) return invalid('Language direction must be rtl or ltr.', 'direction');
  if (key === 'languages' && ((!partial && !data.nativeName) || data.nativeName === null)) return invalid('Native language name is required.', 'nativeName');
  if (key === 'gradeLevels' && ((!partial && !Number.isInteger(data.codeNumber)) || (data.codeNumber !== undefined && !Number.isInteger(data.codeNumber)))) return invalid('Grade code must be an integer.', 'codeNumber');
  if (key === 'genders' && ((!partial && !/^[a-z]$/i.test(String(data.genderCode || ''))) || (data.genderCode !== undefined && !/^[a-z]$/i.test(String(data.genderCode || ''))))) return invalid('Gender code must be one letter.', 'genderCode');
  if (key === 'towns' && (!partial || data.regionId !== undefined) && (!uuid(data.regionId) || !(await platformPrisma.region.findFirst({ where: { id: String(data.regionId), isActive: true }, select: { id: true } })))) return invalid('An active region is required for a town.', 'regionId');
  return null;
};

export async function listPlatformReferenceData(req: ContextRequest, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.headers) {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  }
  const requested = req.query.table ? [String(req.query.table)] : Object.keys(PLATFORM_REFERENCE_TABLES);
  const keys = requested.filter(platformReferenceKey) as PlatformReferenceKey[];
  if (!keys.length) { res.status(400).json({ error: 'Invalid platform reference table.' }); return; }
  const rows = await Promise.all(keys.map(async (key) => {
    const delegate = (platformPrisma as any)[PLATFORM_REFERENCE_TABLES[key]];
    const orderBy = key === 'providers'
      ? [{ sortOrder: 'asc' as const }, { name: 'asc' as const }]
      : key === 'towns' || key === 'studentFeatures'
      ? [{ nameAr: 'asc' as const }]
      : [{ sortOrder: 'asc' as const }, { nameAr: 'asc' as const }];
    const items = await delegate.findMany({ orderBy, ...(key === 'towns' ? { include: { region: true } } : {}) });
    return [key, items] as const;
  }));
  res.json(Object.fromEntries(rows));
}

export async function createPlatformReferenceData(req: ContextRequest, res: Response): Promise<void> {
  const key = String(req.params.table || '');
  if (!platformReferenceKey(key)) { res.status(404).json({ error: 'Platform reference table not found.' }); return; }
  if (!PLATFORM_MUTABLE_REFERENCE_TABLES.has(key)) { res.status(403).json({ error: 'This reference table is read-only at runtime.' }); return; }
  const data = platformReferenceData(key, req.body || {});
  const validationError = await validatePlatformReferenceData(key, data, false);
  if (validationError) { res.status(400).json({ code: 'VALIDATION_ERROR', message: validationError.message, fieldErrors: validationError.fieldErrors }); return; }
  try {
    const delegate = (platformPrisma as any)[PLATFORM_REFERENCE_TABLES[key]];
    const created = await platformPrisma.$transaction(async (tx) => {
      const row = await (tx as any)[PLATFORM_REFERENCE_TABLES[key]].create({ data });
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'REFERENCE_DATA_CREATED', entityType: key, entityId: row.id, metadata: { key, nameAr: row.nameAr || row.name, providerCode: row.providerCode || null } }, tx);
      return row;
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (key === 'providers' && error?.code === 'P2002') { res.status(409).json({ code: 'DUPLICATE_PROVIDER_CODE', message: 'Provider code is already in use.', fieldErrors: { providerCode: 'Provider code is already in use.' } }); return; }
    errorResponse(res, error);
  }
}

export async function updatePlatformReferenceData(req: ContextRequest, res: Response): Promise<void> {
  const key = String(req.params.table || '');
  const id = String(req.params.id || '');
  if (!platformReferenceKey(key)) { res.status(404).json({ error: 'Platform reference table not found.' }); return; }
  if (!PLATFORM_MUTABLE_REFERENCE_TABLES.has(key)) { res.status(403).json({ error: 'This reference table is read-only at runtime.' }); return; }
  const delegate = (platformPrisma as any)[PLATFORM_REFERENCE_TABLES[key]];
  try {
    const current = await delegate.findUnique({ where: { id } });
    if (!current) { res.status(404).json({ error: 'Reference item not found.' }); return; }
    const data = platformReferenceData(key, req.body || {}, true);
    const validationError = await validatePlatformReferenceData(key, data, true);
    if (validationError) { res.status(400).json({ code: 'VALIDATION_ERROR', message: validationError.message, fieldErrors: validationError.fieldErrors }); return; }
    const editableFields = REFERENCE_DISPLAY_FIELDS[key] || [];
    if (current.isSystem === true && Object.keys(data).some((field) => !editableFields.includes(field))) { res.status(409).json({ error: 'System lookup items allow display-field changes only.' }); return; }
    if (key === 'towns' && data.regionId !== undefined && data.regionId !== current.regionId) {
      res.status(409).json({ error: 'A town region cannot be changed after creation; create a separate town for the other region.' }); return;
    }
    const updated = await platformPrisma.$transaction(async (tx) => {
      const row = await (tx as any)[PLATFORM_REFERENCE_TABLES[key]].update({ where: { id }, data });
      const action = data.isActive !== undefined && data.isActive !== current.isActive
        ? (data.isActive ? 'REFERENCE_DATA_ACTIVATED' : 'REFERENCE_DATA_DEACTIVATED')
        : 'REFERENCE_DATA_UPDATED';
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action, entityType: key, entityId: id, metadata: { key, changedFields: Object.keys(data) } }, tx);
      return row;
    });
    res.json(updated);
  } catch (error: any) {
    if (key === 'providers' && error?.code === 'P2002') { res.status(409).json({ code: 'DUPLICATE_PROVIDER_CODE', message: 'Provider code is already in use.', fieldErrors: { providerCode: 'Provider code is already in use.' } }); return; }
    errorResponse(res, error);
  }
}

export async function deletePlatformReferenceData(req: ContextRequest, res: Response): Promise<void> {
  const key = String(req.params.table || '');
  const id = String(req.params.id || '');
  if (!platformReferenceKey(key)) { res.status(404).json({ error: 'Platform reference table not found.' }); return; }
  if (!PLATFORM_MUTABLE_REFERENCE_TABLES.has(key)) { res.status(403).json({ error: 'This reference table is read-only at runtime.' }); return; }
  if (key === 'providers') { res.status(409).json({ code: 'PROVIDER_DELETE_NOT_ALLOWED', message: 'Providers are historical references; deactivate them instead of deleting them.' }); return; }
  const delegate = (platformPrisma as any)[PLATFORM_REFERENCE_TABLES[key]];
  try {
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Reference item not found.' }); return; }
    if (existing.isSystem === true) { res.status(409).json({ code: 'SYSTEM_PROTECTED', error: 'System lookup items cannot be deleted.' }); return; }
    const counts = await getReferenceDependencyCounts(key as PlatformReferenceDependencyKind, id);
    const used = counts.filter((dependency) => dependency.count > 0);
    if (used.length) {
      res.status(409).json({ code: 'REFERENCE_IN_USE', message: 'This reference record is currently in use.', dependencies: used });
      return;
    }
    await platformPrisma.$transaction(async (tx) => {
      await (tx as any)[PLATFORM_REFERENCE_TABLES[key]].delete({ where: { id } });
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'REFERENCE_DATA_DELETED', entityType: key, entityId: id, metadata: { type: key, snapshot: existing } }, tx);
    });
    res.json({ success: true, id });
  } catch (error) { errorResponse(res, error); }
}

const validProviderInput = (data: ReturnType<typeof providerInput>, partial = false): boolean =>
  (partial || Boolean(data.providerCode && data.name))
  && (data.providerCode === undefined || (data.providerCode.length > 0 && data.providerCode.length <= 20))
  && (data.name === undefined || (data.name.length > 0 && data.name.length <= 150))
  && (data.sortOrder === undefined || Number.isInteger(data.sortOrder));

const institutionRelations = {
  type: true,
  region: true,
  town: true,
  status: true,
  defaultLanguage: true,
  subscriptions: { where: current, orderBy: { startsAt: 'desc' as const }, take: 1, include: { plan: true } },
} as const;

export async function listInstitutions(req: ContextRequest, res: Response): Promise<void> {
  const scope = String(req.query.scope || 'active');
  const where = scope === 'archived' ? { archivedAt: { not: null } } : scope === 'all' ? {} : { archivedAt: null };
  if (!['active', 'archived', 'all'].includes(scope)) { res.status(400).json({ error: 'Invalid institution scope.' }); return; }
  const rows = await platformPrisma.institution.findMany({ where, orderBy: { nameAr: 'asc' }, include: institutionRelations });
  const result = await Promise.all(rows.map(async ({ subscriptions, ...institution }) => ({ ...institution, subscription: subscriptions[0] || null, plan: subscriptions[0]?.plan || null, initialAdmin: await getInitialAdminStatus(institution.id) })));
  res.json(result);
}

export async function getInstitution(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid institution id.' }); return; }
  const institution = await platformPrisma.institution.findUnique({ where: { id }, include: { ...institutionRelations, subscriptions: { orderBy: { startsAt: 'desc' }, include: { plan: true } } } });
  if (!institution) { res.status(404).json({ error: 'Institution not found.' }); return; }
  const { subscriptions, ...metadata } = institution;
  const subscriptionState = await getPlatformEffectiveSubscriptionState(id);
  res.json({ ...metadata, currentSubscription: subscriptions.find((item) => ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'].includes(item.status)) || null, subscriptionHistory: subscriptions, subscriptionState, initialAdmin: await getInitialAdminStatus(id) });
}

export async function getInitialAdmin(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid institution id.' }); return; }
  const institution = await platformPrisma.institution.findUnique({ where: { id }, select: { id: true } });
  if (!institution) { res.status(404).json({ error: 'Institution not found.' }); return; }
  res.json(await getInitialAdminStatus(id));
}

const onboardingResponse = (value: any) => process.env['NODE_ENV'] === 'production' ? { ...value, setup: { expiresAt: value.setup.expiresAt } } : value;

export async function provisionInitialAdmin(req: ContextRequest, res: Response): Promise<void> {
  try {
    const result = await provisionInitialSchoolAdmin({ institutionId: String(req.params.id || ''), email: String(req.body?.email || ''), firstNameAr: String(req.body?.firstNameAr || ''), familyNameAr: String(req.body?.familyNameAr || req.body?.lastNameAr || ''), firstNameHe: req.body?.firstNameHe, familyNameHe: req.body?.familyNameHe || req.body?.lastNameHe, phoneNumber: req.body?.phoneNumber, nationalId: req.body?.nationalId, actorUserId: req.user?.uid });
    res.status(201).json(onboardingResponse(result));
  } catch (error) { errorResponse(res, error); }
}

export async function reissueInitialAdmin(req: ContextRequest, res: Response): Promise<void> {
  try { res.json(onboardingResponse(await reissueInitialAdminSetup({ institutionId: String(req.params.id || ''), actorUserId: req.user?.uid }))); } catch (error) { errorResponse(res, error); }
}

export async function revokeInitialAdmin(req: ContextRequest, res: Response): Promise<void> {
  try { res.json(await revokeInitialAdminSetup({ institutionId: String(req.params.id || ''), actorUserId: req.user?.uid })); } catch (error) { errorResponse(res, error); }
}

export async function createInstitution(req: ContextRequest, res: Response): Promise<void> {
  const body = req.body || {};
  const required = ['schoolCode', 'nameAr', 'typeId', 'regionId', 'statusId', 'defaultLanguageId'];
  if (required.some((key) => !body[key]) || !required.slice(2).every((key) => uuid(body[key]))) { res.status(400).json({ error: 'Institution metadata is incomplete or invalid.' }); return; }
  const schoolCode = String(body.schoolCode).trim().toUpperCase();
  const slug = String(body.slug || `school-${schoolCode.toLowerCase().replace(/_/g, '-')}`).trim().toLowerCase();
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const planId = body.planId ? String(body.planId) : null;
  if (planId && !uuid(planId)) { res.status(400).json({ error: 'Selected plan is invalid.' }); return; }
  if (!/^[A-Z0-9_-]{2,20}$/.test(schoolCode) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { res.status(400).json({ error: 'Institution code, slug, or email format is invalid.' }); return; }
  try {
    const region = await platformPrisma.region.findUnique({ where: { id: body.regionId }, select: { id: true } });
    if (!region) { res.status(400).json({ error: 'Selected region is invalid.' }); return; }
    if (body.townId) {
      const town = await platformPrisma.town.findUnique({ where: { id: String(body.townId) }, select: { id: true, regionId: true } });
      if (!town || town.regionId !== body.regionId) { res.status(400).json({ error: 'Selected town does not belong to the selected region.' }); return; }
    }
    const result = await platformPrisma.$transaction(async (tx) => {
      if (planId && !await lockPlatformPlan(tx, planId)) throw Object.assign(new Error('Plan not found or inactive.'), { statusCode: 400 });
      const plan = planId ? await tx.plan.findUnique({ where: { id: planId }, select: { id: true, isActive: true } }) : null;
      if (planId && (!plan || !plan.isActive)) throw Object.assign(new Error('Plan not found or inactive.'), { statusCode: 400 });
      const institution = await tx.institution.create({ data: { schoolCode, slug, nameAr: String(body.nameAr).trim(), nameHe: body.nameHe ? String(body.nameHe).trim() : null, phoneNumber: body.phoneNumber ? String(body.phoneNumber).trim() : null, email, typeId: body.typeId, regionId: body.regionId, statusId: body.statusId, defaultLanguageId: body.defaultLanguageId, townId: uuid(body.townId) ? body.townId : null, logoUrl: body.logoUrl || null, brandingSettings: body.brandingSettings || null, createdBy: req.user?.uid || null } });
      const subscription = plan ? await tx.institutionSubscription.create({ data: { institutionId: institution.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() }, include: { plan: true } }) : null;
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'INSTITUTION_CREATED', entityType: 'Institution', entityId: institution.id, targetInstitutionId: institution.id, metadata: { schoolCode } }, tx);
      if (subscription) await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'SUBSCRIPTION_ASSIGNED', entityType: 'InstitutionSubscription', entityId: subscription.id, targetInstitutionId: institution.id, targetPlanId: planId, metadata: { status: subscription.status, source: 'institution_creation' } }, tx);
      return { institution, subscription };
    });
    res.status(201).json(result);
  } catch (error) { errorResponse(res, error); }
}

export async function updateInstitution(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid institution id.' }); return; }
  const body = req.body || {};
  const text = (value: unknown) => String(value ?? '').trim();
  const schoolCode = text(body.schoolCode).toUpperCase();
  const slug = text(body.slug).toLowerCase();
  const email = text(body.email).toLowerCase();
  if (!text(body.nameAr) || !schoolCode || !slug || !uuid(body.typeId) || !uuid(body.regionId) || !uuid(body.statusId) || !uuid(body.defaultLanguageId)) { res.status(400).json({ error: 'Institution metadata is incomplete or invalid.' }); return; }
  if (!/^[A-Z0-9_-]{2,20}$/.test(schoolCode) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { res.status(400).json({ error: 'Institution code, slug, or email format is invalid.' }); return; }
  try {
    const region = await platformPrisma.region.findUnique({ where: { id: body.regionId }, select: { id: true } });
    if (!region) { res.status(400).json({ error: 'Selected region is invalid.' }); return; }
    if (body.townId) {
      const town = await platformPrisma.town.findUnique({ where: { id: String(body.townId) }, select: { id: true, regionId: true } });
      if (!town || town.regionId !== body.regionId) { res.status(400).json({ error: 'Selected town does not belong to the selected region.' }); return; }
    }
    const updated = await platformPrisma.$transaction(async (tx) => {
      const result = await tx.institution.update({ where: { id }, data: { nameAr: text(body.nameAr), nameHe: text(body.nameHe) || null, schoolCode, slug, typeId: body.typeId, regionId: body.regionId, townId: uuid(body.townId) ? body.townId : null, statusId: body.statusId, defaultLanguageId: body.defaultLanguageId, phoneNumber: text(body.phoneNumber) || null, email: email || null, logoUrl: text(body.logoUrl) || null, updatedBy: req.user?.uid || null }, include: institutionRelations });
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'INSTITUTION_UPDATED', entityType: 'Institution', entityId: id, targetInstitutionId: id, metadata: { changedFields: Object.keys(body).filter((key) => key !== 'brandingSettings') } }, tx);
      return result;
    });
    res.json(updated);
  } catch (error) { errorResponse(res, error); }
}

export async function archiveInstitution(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid institution id.' }); return; }
  try {
    const result = await platformPrisma.$transaction(async (tx) => {
      const existing = await tx.institution.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
      if (!existing) throw Object.assign(new Error('Institution not found.'), { statusCode: 404 });
      if (existing.archivedAt) return existing;
      const archived = await tx.institution.update({ where: { id }, data: { archivedAt: new Date(), updatedBy: req.user?.uid || null } });
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'INSTITUTION_ARCHIVED', entityType: 'Institution', entityId: id, targetInstitutionId: id, metadata: { lifecycle: 'archive' } }, tx);
      return archived;
    });
    res.json(result);
  } catch (error) { errorResponse(res, error); }
}

export async function restoreInstitution(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid institution id.' }); return; }
  try {
    const result = await platformPrisma.$transaction(async (tx) => {
      const existing = await tx.institution.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
      if (!existing) throw Object.assign(new Error('Institution not found.'), { statusCode: 404 });
      if (!existing.archivedAt) return existing;
      const restored = await tx.institution.update({ where: { id }, data: { archivedAt: null, updatedBy: req.user?.uid || null } });
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'INSTITUTION_RESTORED', entityType: 'Institution', entityId: id, targetInstitutionId: id, metadata: { lifecycle: 'restore' } }, tx);
      return restored;
    });
    res.json(result);
  } catch (error) { errorResponse(res, error); }
}

export async function listPlans(_req: ContextRequest, res: Response): Promise<void> { res.json(await platformPrisma.plan.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'asc' }] })); }

export async function createPlan(req: ContextRequest, res: Response): Promise<void> {
  const body = req.body || {};
  if (!body.code || !body.nameAr) { res.status(400).json({ error: 'Plan code and Arabic name are required.' }); return; }
  const parsed = parsePlanPatch(Object.fromEntries(planEditableFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]])));
  if (parsed.error) { res.status(400).json({ code: parsed.error.code, error: parsed.error.message, ...(parsed.error.field ? { field: parsed.error.field } : {}) }); return; }
  try { const plan = await platformPrisma.plan.create({ data: { code: String(body.code).trim().toUpperCase(), ...(parsed.data as any) } }); await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'PLAN_CREATED', entityType: 'Plan', entityId: plan.id, targetPlanId: plan.id, metadata: { code: plan.code } }); res.status(201).json(plan); } catch (error) { errorResponse(res, error); }
}

const planEditableFields = ['nameAr', 'nameHe', 'descriptionAr', 'descriptionHe', 'maxStudents', 'maxStaff', 'maxUsers', 'isActive'] as const;
type PlanEditableField = typeof planEditableFields[number];

function parsePlanPatch(body: Record<string, unknown>): { data?: Record<string, unknown>; changedFields?: PlanEditableField[]; error?: { message: string; field?: string; code?: string } } {
  const immutable = Object.keys(body).find((field) => !planEditableFields.includes(field as PlanEditableField));
  if (immutable) return { error: { code: 'IMMUTABLE_FIELD', field: immutable, message: `Plan field '${immutable}' cannot be modified.` } };
  const data: Record<string, unknown> = {};
  const changedFields = Object.keys(body) as PlanEditableField[];
  for (const field of changedFields) {
    const value = body[field];
    if (field === 'nameAr') {
      if (typeof value !== 'string' || !value.trim()) return { error: { code: 'VALIDATION_ERROR', field, message: 'Plan Arabic name is required.' } };
      data[field] = value.trim();
    } else if (field === 'nameHe' || field === 'descriptionAr' || field === 'descriptionHe') {
      if (value !== null && value !== undefined && typeof value !== 'string') return { error: { code: 'VALIDATION_ERROR', field, message: `${field} must be a string or null.` } };
      data[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
    } else if (field === 'isActive') {
      if (typeof value !== 'boolean') return { error: { code: 'VALIDATION_ERROR', field, message: 'isActive must be a boolean.' } };
      data[field] = value;
    } else if (value !== null && value !== undefined) {
      if (!Number.isInteger(value) || Number(value) < 0) return { error: { code: 'VALIDATION_ERROR', field, message: `${field} must be a non-negative integer or null.` } };
      data[field] = Number(value);
    } else {
      data[field] = null;
    }
  }
  if (!changedFields.length) return { error: { code: 'VALIDATION_ERROR', message: 'At least one editable plan field is required.' } };
  return { data, changedFields };
}

export async function updatePlan(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid plan id.' }); return; }
  const parsed = parsePlanPatch(req.body || {});
  if (parsed.error) { res.status(400).json({ code: parsed.error.code, error: parsed.error.message, ...(parsed.error.field ? { field: parsed.error.field } : {}) }); return; }
  try {
    const plan = await platformPrisma.$transaction(async (tx) => {
      if (!await lockPlatformPlan(tx, id)) throw Object.assign(new Error('Plan not found.'), { statusCode: 404 });
      const currentPlan = await tx.plan.findUnique({ where: { id } });
      if (!currentPlan) throw Object.assign(new Error('Plan not found.'), { statusCode: 404 });
      const limits = ['maxStudents', 'maxStaff', 'maxUsers'] as const;
      if (limits.some((field) => parsed.data?.[field] !== undefined && parsed.data?.[field] !== null)) {
        // Include historical subscribers in the lock set, then decide from post-lock state.
        const subscriptions = await tx.institutionSubscription.findMany({ where: { planId: id }, select: { institutionId: true } });
        const institutionIds = [...new Set(subscriptions.map((subscription) => subscription.institutionId))].sort();
        await lockPlatformInstitutions(tx, institutionIds);
        const usage = [] as { students: number; staff: number; users: number }[];
        for (const institutionId of institutionIds) {
          const state = await getEffectiveSubscriptionState(institutionId, tx, (id) => getInstitutionUsage(id, tx));
          const previouslyApplicable = await tx.institutionSubscription.findFirst({ where: { institutionId, planId: id, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] }, AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, { OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: new Date() } }] }] }, select: { id: true } });
          if ((state.subscription?.planId === id && state.isActive) || previouslyApplicable) usage.push(state.usage);
        }
        for (const field of limits) {
          const requested = parsed.data?.[field];
          if (requested !== undefined && requested !== null) {
            const currentUsage = Math.max(0, ...usage.map((item) => field === 'maxStudents' ? item.students : field === 'maxStaff' ? item.staff : item.users));
            if (Number(requested) < currentUsage) throw Object.assign(new Error(`${field} cannot be lower than current usage (${currentUsage}).`), { statusCode: 409, code: 'PLAN_LIMIT_BELOW_USAGE', field, currentUsage });
          }
        }
      }
      const updated = await tx.plan.update({ where: { id }, data: parsed.data as any });
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'PLAN_UPDATED', entityType: 'Plan', entityId: id, targetPlanId: id, metadata: { changedFields: parsed.changedFields } }, tx);
      return updated;
    });
    res.json(plan);
  } catch (error) { errorResponse(res, error); }
}

export async function listProviders(_req: ContextRequest, res: Response): Promise<void> {
  res.json(await platformPrisma.provider.findMany({ orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] }));
}

export async function createProvider(req: ContextRequest, res: Response): Promise<void> {
  const data = providerInput(req.body || {});
  if (!validProviderInput(data)) { res.status(400).json({ error: 'Provider code, name, and sort order are invalid.' }); return; }
  try {
    const provider = await platformPrisma.$transaction(async (tx) => {
      const created = await tx.provider.create({ data: {
        providerCode: data.providerCode!,
        name: data.name!,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
        createdBy: req.user?.uid || null,
      } });
      await recordPlatformAuditEvent({
        actorUserId: req.user?.uid,
        action: 'PROVIDER_CREATED',
        entityType: 'Provider',
        entityId: created.id,
        metadata: { providerCode: created.providerCode, name: created.name, isActive: created.isActive, sortOrder: created.sortOrder },
      }, tx);
      return created;
    });
    res.status(201).json(provider);
  } catch (error) { errorResponse(res, error); }
}

export async function updateProvider(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid provider id.' }); return; }
  const data = providerInput(req.body || {}, true);
  if (!Object.keys(data).length || !validProviderInput(data, true)) { res.status(400).json({ error: 'Provider update is empty or invalid.' }); return; }
  try {
    const provider = await platformPrisma.$transaction(async (tx) => {
      const previous = await tx.provider.findUnique({ where: { id } });
      if (!previous) throw Object.assign(new Error('Provider not found.'), { statusCode: 404 });
      const updated = await tx.provider.update({ where: { id }, data: { ...data, updatedBy: req.user?.uid || null } });
      await recordPlatformAuditEvent({
        actorUserId: req.user?.uid,
        action: 'PROVIDER_UPDATED',
        entityType: 'Provider',
        entityId: id,
        metadata: {
          changedFields: Object.keys(data),
          previous: { providerCode: previous.providerCode, name: previous.name, isActive: previous.isActive, sortOrder: previous.sortOrder },
          current: { providerCode: updated.providerCode, name: updated.name, isActive: updated.isActive, sortOrder: updated.sortOrder },
        },
      }, tx);
      return updated;
    });
    res.json(provider);
  } catch (error) { errorResponse(res, error); }
}

export async function assignSubscription(req: ContextRequest, res: Response): Promise<void> { try { const result = await assignPlatformSubscription({ institutionId: String(req.params.id), planId: String(req.body?.planId || ''), status: req.body?.status, startsAt: req.body?.startsAt ? new Date(req.body.startsAt) : undefined, endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : null, trialEndsAt: req.body?.trialEndsAt ? new Date(req.body.trialEndsAt) : null, actorUserId: req.user?.uid }); res.status(201).json(result); } catch (error) { errorResponse(res, error); } }
export async function transitionSubscription(req: ContextRequest, res: Response): Promise<void> { try { const result = await transitionPlatformSubscription({ institutionId: String(req.params.id), status: req.body?.status, actorUserId: req.user?.uid, endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : undefined }); res.json(result); } catch (error) { errorResponse(res, error); } }
export async function renewSubscription(req: ContextRequest, res: Response): Promise<void> { try { const result = await renewPlatformSubscription({ institutionId: String(req.params.id), endsAt: new Date(req.body?.endsAt), actorUserId: req.user?.uid }); res.json(result); } catch (error) { errorResponse(res, error); } }

export async function getPlatformAudit(req: ContextRequest, res: Response): Promise<void> { const targetInstitutionId = req.query.institutionId ? String(req.query.institutionId) : undefined; res.json(await platformPrisma.platformAuditLog.findMany({ where: targetInstitutionId ? { targetInstitutionId } : undefined, orderBy: { createdAt: 'desc' }, take: 200 })); }
