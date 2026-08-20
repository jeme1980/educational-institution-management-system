import { Response } from 'express';
import type { SubscriptionStatus } from '@prisma/client';
import type { ContextRequest } from '../middleware/context';
import { platformPrisma } from '../db/platform-prisma';
import { recordPlatformAuditEvent } from '../services/platform-audit.service';
import { assignPlatformSubscription, renewPlatformSubscription, transitionPlatformSubscription } from '../services/platform-subscription.service';
import { getInitialAdminStatus, provisionInitialSchoolAdmin, reissueInitialAdminSetup } from '../services/school-onboarding.service';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const current = { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as SubscriptionStatus[] } };
const errorResponse = (res: Response, error: any) => {
  if (error?.code === 'P2002') { res.status(409).json({ error: 'A record with the same unique code or slug already exists.' }); return; }
  if (error?.code === 'P2003') { res.status(400).json({ error: 'One or more selected lookup values are invalid.' }); return; }
  const statusCode = Number(error?.statusCode);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    res.status(statusCode).json({ error: error?.message || 'Platform operation failed.', ...(error?.code ? { code: error.code } : {}) });
    return;
  }
  throw error;
};

const providerInput = (body: Record<string, unknown>, partial = false) => {
  const data: { providerCode?: string; name?: string; isActive?: boolean; sortOrder?: number } = {};
  if (!partial || body.providerCode !== undefined) data.providerCode = String(body.providerCode || '').trim();
  if (!partial || body.name !== undefined) data.name = String(body.name || '').trim();
  if (!partial || body.isActive !== undefined) data.isActive = body.isActive !== false;
  if (!partial || body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder ?? 0);
  return data;
};

const validProviderInput = (data: ReturnType<typeof providerInput>, partial = false): boolean =>
  (partial || Boolean(data.providerCode && data.name))
  && (data.providerCode === undefined || (data.providerCode.length > 0 && data.providerCode.length <= 20))
  && (data.name === undefined || (data.name.length > 0 && data.name.length <= 150))
  && (data.sortOrder === undefined || Number.isInteger(data.sortOrder));

export async function listInstitutions(_req: ContextRequest, res: Response): Promise<void> {
  const rows = await platformPrisma.institution.findMany({ where: { archivedAt: null }, orderBy: { nameAr: 'asc' }, include: { status: true, subscriptions: { where: current, orderBy: { startsAt: 'desc' }, take: 1, include: { plan: true } } } });
  const result = await Promise.all(rows.map(async ({ subscriptions, ...institution }) => ({ ...institution, subscription: subscriptions[0] || null, plan: subscriptions[0]?.plan || null, initialAdmin: await getInitialAdminStatus(institution.id) })));
  res.json(result);
}

export async function getInstitution(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid institution id.' }); return; }
  const institution = await platformPrisma.institution.findUnique({ where: { id }, include: { status: true, subscriptions: { orderBy: { startsAt: 'desc' }, include: { plan: true } } } });
  if (!institution) { res.status(404).json({ error: 'Institution not found.' }); return; }
  const { subscriptions, ...metadata } = institution;
  res.json({ ...metadata, currentSubscription: subscriptions.find((item) => ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'].includes(item.status)) || null, subscriptionHistory: subscriptions, initialAdmin: await getInitialAdminStatus(id) });
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

export async function createInstitution(req: ContextRequest, res: Response): Promise<void> {
  const body = req.body || {};
  const required = ['schoolCode', 'nameAr', 'typeId', 'regionId', 'statusId', 'defaultLanguageId'];
  if (required.some((key) => !body[key]) || !required.slice(2).every((key) => uuid(body[key]))) { res.status(400).json({ error: 'Institution metadata is incomplete or invalid.' }); return; }
  const schoolCode = String(body.schoolCode).trim().toUpperCase();
  const slug = String(body.slug || `school-${schoolCode.toLowerCase().replace(/_/g, '-')}`).trim().toLowerCase();
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  if (!/^[A-Z0-9_-]{2,20}$/.test(schoolCode) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { res.status(400).json({ error: 'Institution code, slug, or email format is invalid.' }); return; }
  try {
    const result = await platformPrisma.$transaction(async (tx) => {
      const institution = await tx.institution.create({ data: { schoolCode, slug, nameAr: String(body.nameAr).trim(), nameHe: body.nameHe ? String(body.nameHe).trim() : null, phoneNumber: body.phoneNumber ? String(body.phoneNumber).trim() : null, email, typeId: body.typeId, regionId: body.regionId, statusId: body.statusId, defaultLanguageId: body.defaultLanguageId, townId: uuid(body.townId) ? body.townId : null, logoUrl: body.logoUrl || null, brandingSettings: body.brandingSettings || null, createdBy: req.user?.uid || null } });
      await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'INSTITUTION_CREATED', entityType: 'Institution', entityId: institution.id, targetInstitutionId: institution.id, metadata: { schoolCode } }, tx);
      return { institution, subscription: null };
    });
    res.status(201).json(result);
  } catch (error) { errorResponse(res, error); }
}

export async function updateInstitution(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid institution id.' }); return; }
  const body = req.body || {};
  try {
    const updated = await platformPrisma.institution.update({ where: { id }, data: { nameAr: body.nameAr, nameHe: body.nameHe || null, schoolCode: body.schoolCode, slug: body.slug, typeId: body.typeId, regionId: body.regionId, townId: uuid(body.townId) ? body.townId : null, statusId: body.statusId, defaultLanguageId: body.defaultLanguageId, logoUrl: body.logoUrl || null, brandingSettings: body.brandingSettings || null } });
    await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'INSTITUTION_UPDATED', entityType: 'Institution', entityId: id, targetInstitutionId: id, metadata: { changedFields: Object.keys(body) } });
    res.json(updated);
  } catch (error) { errorResponse(res, error); }
}

export async function listPlans(_req: ContextRequest, res: Response): Promise<void> { res.json(await platformPrisma.plan.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'asc' }] })); }

export async function createPlan(req: ContextRequest, res: Response): Promise<void> {
  const body = req.body || {};
  if (!body.code || !body.nameAr) { res.status(400).json({ error: 'Plan code and Arabic name are required.' }); return; }
  try { const plan = await platformPrisma.plan.create({ data: { code: String(body.code).trim().toUpperCase(), nameAr: String(body.nameAr), nameHe: body.nameHe || null, descriptionAr: body.descriptionAr || null, descriptionHe: body.descriptionHe || null, maxStudents: body.maxStudents == null ? null : Number(body.maxStudents), maxStaff: body.maxStaff == null ? null : Number(body.maxStaff), maxUsers: body.maxUsers == null ? null : Number(body.maxUsers) } }); await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'PLAN_CREATED', entityType: 'Plan', entityId: plan.id, targetPlanId: plan.id, metadata: { code: plan.code } }); res.status(201).json(plan); } catch (error) { errorResponse(res, error); }
}

export async function updatePlan(req: ContextRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '');
  if (!uuid(id)) { res.status(400).json({ error: 'Invalid plan id.' }); return; }
  const body = req.body || {};
  try { const plan = await platformPrisma.plan.update({ where: { id }, data: { nameAr: body.nameAr, nameHe: body.nameHe || null, descriptionAr: body.descriptionAr || null, descriptionHe: body.descriptionHe || null, maxStudents: body.maxStudents == null ? null : Number(body.maxStudents), maxStaff: body.maxStaff == null ? null : Number(body.maxStaff), maxUsers: body.maxUsers == null ? null : Number(body.maxUsers), isActive: body.isActive === undefined ? undefined : Boolean(body.isActive) } }); await recordPlatformAuditEvent({ actorUserId: req.user?.uid, action: 'PLAN_UPDATED', entityType: 'Plan', entityId: id, targetPlanId: id, metadata: { changedFields: Object.keys(body) } }); res.json(plan); } catch (error) { errorResponse(res, error); }
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
