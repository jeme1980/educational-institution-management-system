import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';

export const PUBLIC_LOOKUP_KEYS = [
  'regions',
  'towns',
  'institutionStatuses',
  'languages',
  'educationTypes',
  'educationStages',
  'gradeLevels',
  'classTypes',
  'compositionTypes',
  'genders',
  'studentStatuses',
  'enrollmentStatuses',
  'relationTypes',
  'studentFeatures',
  'specializations',
  'providers',
] as const;

export type PublicLookupKey = (typeof PUBLIC_LOOKUP_KEYS)[number];

const delegateNames: Record<PublicLookupKey, string> = {
  regions: 'region',
  towns: 'town',
  institutionStatuses: 'institutionStatus',
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
  specializations: 'specialization',
  providers: 'provider',
};

const isPublicLookupKey = (value: string): value is PublicLookupKey =>
  PUBLIC_LOOKUP_KEYS.includes(value as PublicLookupKey);

const INSTITUTION_MANAGED_LOOKUP_KEYS = new Set<PublicLookupKey>(['specializations']);

const rejectGlobalLookupMutation = (key: PublicLookupKey, res: Response): boolean => {
  if (INSTITUTION_MANAGED_LOOKUP_KEYS.has(key)) return false;
  res.status(403).json({ error: 'Global reference data cannot be managed from a school context.' });
  return true;
};

const text = (value: unknown): string | null => {
  const result = String(value ?? '').trim();
  return result || null;
};

const booleanValue = (value: unknown, fallback = true): boolean =>
  value === undefined || value === null ? fallback : Boolean(value);

const numberValue = (value: unknown, fallback = 0): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const lookupOrder = (key: PublicLookupKey) =>
  key === 'towns' ? [{ nameAr: 'asc' as const }] : [{ sortOrder: 'asc' as const }, { nameAr: 'asc' as const }];

const findManyFor = (key: PublicLookupKey, institutionId?: string) => {
  switch (key) {
    case 'regions': return prisma.region.findMany({ orderBy: lookupOrder(key) });
    case 'towns': return prisma.town.findMany({ orderBy: lookupOrder(key) });
    case 'institutionStatuses': return prisma.institutionStatus.findMany({ orderBy: lookupOrder(key) });
    case 'languages': return prisma.language.findMany({ orderBy: lookupOrder(key) });
    case 'educationTypes': return prisma.educationType.findMany({ orderBy: lookupOrder(key) });
    case 'educationStages': return prisma.educationStage.findMany({ orderBy: lookupOrder(key) });
    case 'gradeLevels': return prisma.gradeLevel.findMany({ orderBy: [{ sortOrder: 'asc' }, { codeNumber: 'asc' }] });
    case 'classTypes': return prisma.classType.findMany({ orderBy: lookupOrder(key) });
    case 'compositionTypes': return prisma.compositionType.findMany({ orderBy: lookupOrder(key) });
    case 'genders': return prisma.gender.findMany({ orderBy: lookupOrder(key) });
    case 'studentStatuses': return prisma.studentStatus.findMany({ orderBy: lookupOrder(key) });
    case 'enrollmentStatuses': return prisma.enrollmentStatus.findMany({ orderBy: lookupOrder(key) });
    case 'relationTypes': return prisma.relationType.findMany({ orderBy: lookupOrder(key) });
    case 'studentFeatures': return prisma.studentFeature.findMany({ orderBy: [{ nameAr: 'asc' }] });
    case 'specializations': return (prisma as any).specialization.findMany({ where: { institutionId }, orderBy: lookupOrder(key) });
    case 'providers': return prisma.provider.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }).then((items) => items.map((item) => ({ ...item, nameAr: item.name, nameHe: item.providerCode })));
  }
};

const dataFor = (key: PublicLookupKey, body: Record<string, unknown>, partial = false): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  if (key === 'providers') {
    if (!partial || body.providerCode !== undefined || body.nameHe !== undefined) data.providerCode = text(body.providerCode ?? body.nameHe);
    if (!partial || body.name !== undefined || body.providerName !== undefined || body.nameAr !== undefined) data.name = text(body.name ?? body.providerName ?? body.nameAr);
    if (!partial || body.isActive !== undefined) data.isActive = booleanValue(body.isActive);
    if (!partial || body.sortOrder !== undefined) data.sortOrder = numberValue(body.sortOrder);
    return data;
  }
  if (!partial || body.nameAr !== undefined) data.nameAr = text(body.nameAr);
  if (!partial || body.nameHe !== undefined) data.nameHe = text(body.nameHe);

  if (key !== 'towns' && key !== 'studentFeatures') {
    if (!partial || body.isActive !== undefined) data.isActive = booleanValue(body.isActive);
    if (!partial || body.sortOrder !== undefined) data.sortOrder = numberValue(body.sortOrder);
  }
  if (['institutionStatuses', 'languages', 'educationTypes', 'educationStages', 'classTypes', 'compositionTypes'].includes(key)) {
    if (!partial || body.isSystem !== undefined) data.isSystem = booleanValue(body.isSystem, false);
  }
  if (key === 'institutionStatuses') {
    if (!partial || body.schoolCode !== undefined) data.schoolCode = text(body.schoolCode);
    if (!partial || body.allowsLogin !== undefined) data.allowsLogin = booleanValue(body.allowsLogin);
    if (!partial || body.allowsWrites !== undefined) data.allowsWrites = booleanValue(body.allowsWrites);
    if (!partial || body.isBillable !== undefined) data.isBillable = booleanValue(body.isBillable);
  }
  if (key === 'languages') {
    if (!partial || body.nativeName !== undefined) data.nativeName = text(body.nativeName);
    if (!partial || body.direction !== undefined) data.direction = text(body.direction) || 'rtl';
  }
  if (key === 'genders' && (!partial || body.genderCode !== undefined)) {
    data.genderCode = text(body.genderCode)?.toLowerCase() || null;
  }
  if (key === 'gradeLevels') {
    if (!partial || body.codeNumber !== undefined) data.codeNumber = numberValue(body.codeNumber, NaN);
  }
  if (key === 'studentStatuses' || key === 'enrollmentStatuses') {
    if (!partial || body.isFinalStatus !== undefined) data.isFinalStatus = booleanValue(body.isFinalStatus, false);
  }
  return data;
};

const institutionScopedKey = (key: PublicLookupKey): boolean => key === 'specializations';

export async function getPublicLookups(req: ContextRequest, res: Response): Promise<any> {
  const entries = await Promise.all(PUBLIC_LOOKUP_KEYS.map(async (key) => [key, await findManyFor(key, req.context?.institutionId)] as const));
  return res.json(Object.fromEntries(entries));
}

export async function createPublicLookup(req: AuthRequest & ContextRequest, res: Response): Promise<any> {
  const key = String(req.params['table'] || '');
  if (!isPublicLookupKey(key)) return res.status(404).json({ error: 'Public lookup table not found' });
  if (rejectGlobalLookupMutation(key, res)) return;
  const institutionId = req.context?.institutionId || '';
  const data = dataFor(key, req.body || {});
  if (institutionScopedKey(key)) data.institutionId = institutionId;
  if ((key === 'providers' && (!data.providerCode || !data.name)) || (key !== 'providers' && !data.nameAr) || (key === 'languages' && !data.nativeName) || (key === 'gradeLevels' && !Number.isInteger(data.codeNumber))) {
    return res.status(400).json({ error: 'Required lookup fields are missing' });
  }
  if (key === 'genders' && !/^[mf]$/.test(String(data.genderCode || ''))) {
    return res.status(400).json({ error: 'رمز الجنس مطلوب ويجب أن يكون m أو f.' });
  }

  const created = await (prisma as any)[delegateNames[key]].create({ data });
  return res.status(201).json(created);
}

export async function updatePublicLookup(req: AuthRequest & ContextRequest, res: Response): Promise<any> {
  const key = String(req.params['table'] || '');
  const id = String(req.params['id'] || '');
  if (!isPublicLookupKey(key)) return res.status(404).json({ error: 'Public lookup table not found' });
  if (rejectGlobalLookupMutation(key, res)) return;
  const delegate = (prisma as any)[delegateNames[key]];
  const existing = await delegate.findFirst({ where: institutionScopedKey(key) ? { id, institutionId: req.context?.institutionId } : { id } });
  if (!existing) return res.status(404).json({ error: 'Lookup item not found' });
  const data = dataFor(key, req.body || {}, true);
  if ((key === 'providers' && (data.providerCode === null || data.name === null)) || (key !== 'providers' && data.nameAr === null) || (key === 'languages' && data.nativeName === null) || (key === 'gradeLevels' && data.codeNumber !== undefined && !Number.isInteger(data.codeNumber))) {
    return res.status(400).json({ error: 'Required lookup fields are invalid' });
  }
  if (key === 'genders' && data.genderCode !== undefined && !/^[mfu]$/.test(String(data.genderCode || ''))) {
    return res.status(400).json({ error: 'رمز الجنس يجب أن يكون حرفاً واحداً: m أو f أو u.' });
  }
  const updated = await delegate.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
  return res.json(updated);
}

export async function deletePublicLookup(req: AuthRequest & ContextRequest, res: Response): Promise<any> {
  const key = String(req.params['table'] || '');
  const id = String(req.params['id'] || '');
  if (!isPublicLookupKey(key)) return res.status(404).json({ error: 'Public lookup table not found' });
  if (rejectGlobalLookupMutation(key, res)) return;
  const delegate = (prisma as any)[delegateNames[key]];
  const existing = await delegate.findFirst({ where: institutionScopedKey(key) ? { id, institutionId: req.context?.institutionId } : { id } });
  if (!existing) return res.status(404).json({ error: 'Lookup item not found' });
  if (existing.isSystem === true) return res.status(409).json({ error: 'System lookup items cannot be deleted' });
  await delegate.delete({ where: { id } });
  return res.json({ success: true });
}
