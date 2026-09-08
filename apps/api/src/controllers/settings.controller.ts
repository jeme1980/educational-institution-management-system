import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';
import type { InstitutionSettingsUpdate } from '../validation/institution-settings.schemas';

const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const institutionProfileSelect = {
  id: true,
  schoolCode: true,
  slug: true,
  nameAr: true,
  nameHe: true,
  phoneNumber: true,
  email: true,
  logoUrl: true,
  regionId: true,
  townId: true,
  typeId: true,
  statusId: true,
  defaultLanguageId: true,
  updatedAt: true,
  status: { select: { id: true, nameAr: true, isActive: true, allowsWrites: true } },
  region: { select: { id: true, nameAr: true } },
  town: { select: { id: true, nameAr: true } },
  type: { select: { id: true, nameAr: true } },
} as const;

export async function getInstitutionProfile(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  if (!institutionId) return res.status(403).json({ error: 'Unauthorized institution access.' });
  const institution = await prisma.institution.findFirst({ where: { id: institutionId, archivedAt: null }, select: institutionProfileSelect });
  if (!institution) return res.status(404).json({ error: 'Institution not found.' });
  const academicYears = await prisma.academicYear.findMany({
    where: { institutionId, archivedAt: null },
    orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    select: { id: true, institutionId: true, yearLabel: true, startDate: true, endDate: true, isCurrent: true, isClosed: true, archivedAt: true },
  });
  return res.json({ institution, academicYears });
}

export async function updateInstitutionProfile(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  if (!institutionId) return res.status(403).json({ error: 'Unauthorized institution access.' });
  const data = req.body as InstitutionSettingsUpdate;
  const existing = await prisma.institution.findFirst({ where: { id: institutionId, archivedAt: null }, select: { id: true, status: { select: { allowsWrites: true } } } });
  if (!existing) return res.status(404).json({ error: 'Institution not found.' });
  if (!existing.status.allowsWrites) return res.status(403).json({ error: 'Institution settings are read-only.' });
  const updated = await prisma.$transaction(async (tx) => {
    const updateData = {
      ...(data.nameAr !== undefined ? { nameAr: data.nameAr } : {}),
      ...(data.nameHe !== undefined ? { nameHe: data.nameHe || null } : {}),
      ...(data.phoneNumber !== undefined ? { phoneNumber: data.phoneNumber || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl || null } : {}),
      updatedAt: new Date(),
    };
    const result = await tx.institution.update({ where: { id: institutionId }, data: updateData, select: institutionProfileSelect });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'UPDATE', entityType: 'Institution', entityId: institutionId, metadata: { changedFields: Object.keys(data) } });
    return result;
  });
  return res.json(updated);
}

export async function setCurrentAcademicYear(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const id = String(req.params['id'] || '');
  if (!institutionId || !isUuid(id)) return res.status(400).json({ error: 'Invalid academic year.' });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // The authenticated request may already be inside the RLS transaction.
      // Serialize switches per institution in either case.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', institutionId);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))", institutionId, id);
      const selected = await tx.academicYear.findFirst({
        where: { id, institutionId, archivedAt: null, isClosed: false },
        select: { id: true },
      });
      if (!selected) return null;
      await tx.academicYear.updateMany({ where: { institutionId, isCurrent: true }, data: { isCurrent: false } });
      const result = await tx.academicYear.update({ where: { id: selected.id }, data: { isCurrent: true, updatedAt: new Date() } });
      await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'CURRENT_YEAR_CHANGE', entityType: 'AcademicYear', entityId: selected.id, metadata: { previousCurrentChanged: true } });
      return result;
    }, { isolationLevel: 'Serializable' });
    if (!updated) return res.status(400).json({ error: 'Academic year is invalid, closed, archived, or not assigned to this institution.' });
    return res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2034' || error?.code === 'P2002') return res.status(409).json({ error: 'The current academic year changed concurrently. Please retry.' });
    throw error;
  }
}

export async function closeAcademicYear(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const id = String(req.params['id'] || '');
  if (!institutionId || !isUuid(id)) return res.status(400).json({ error: 'Invalid academic year.', code: 'INVALID_ACADEMIC_YEAR' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', institutionId);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))", institutionId, id);
      const academicYear = await tx.academicYear.findFirst({ where: { id, institutionId } });
      if (!academicYear) return { kind: 'missing' } as const;
      if (academicYear.archivedAt) return { kind: 'archived' } as const;
      if (academicYear.isCurrent) return { kind: 'current' } as const;
      if (academicYear.isClosed) return { kind: 'success', academicYear, alreadyClosed: true } as const;

      const updated = await tx.academicYear.update({ where: { id: academicYear.id }, data: { isClosed: true, updatedAt: new Date() } });
      await recordAuditEvent(tx, {
        institutionId,
        actorUserId: req.user?.uid,
        action: 'ACADEMIC_YEAR_CLOSED',
        entityType: 'AcademicYear',
        entityId: academicYear.id,
        metadata: { academicYearId: academicYear.id, yearLabel: academicYear.yearLabel, previousIsClosed: false, newIsClosed: true },
      });
      return { kind: 'success', academicYear: updated, alreadyClosed: false } as const;
    }, { isolationLevel: 'Serializable' });

    if (result.kind === 'missing') return res.status(404).json({ error: 'Academic year not found.', code: 'ACADEMIC_YEAR_NOT_FOUND' });
    if (result.kind === 'archived') return res.status(409).json({ error: 'Archived academic years cannot be closed.', code: 'ACADEMIC_YEAR_ARCHIVED' });
    if (result.kind === 'current') return res.status(409).json({ error: 'لا يمكن إغلاق السنة الدراسية الحالية. عيّن سنة أخرى كسنة حالية أولًا.', code: 'ACADEMIC_YEAR_IS_CURRENT' });
    return res.json({ academicYear: result.academicYear, alreadyClosed: result.alreadyClosed });
  } catch (error: any) {
    if (error?.code === 'P2034') return res.status(409).json({ error: 'Academic year state changed concurrently. Please retry.', code: 'ACADEMIC_YEAR_STATE_CONFLICT' });
    throw error;
  }
}

async function trustedInstitutionId(req: ContextRequest): Promise<string | null> {
  const membership = await prisma.institutionUser.findFirst({
    where: { userId: req.user?.uid, isActive: true, archivedAt: null },
    select: { institutionId: true },
  });
  return membership?.institutionId || null;
}

export async function getInstitutions(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = await trustedInstitutionId(req);
  if (!institutionId) return res.status(403).json({ error: 'No active institution membership found.' });
  const [insts, towns] = await Promise.all([
    prisma.institution.findMany({
      where: { id: institutionId },
      orderBy: { nameAr: 'asc' },
      include: {
        _count: {
          select: {
            students: true,
            classes: true,
            staffMembers: true,
          },
        },
      },
    }),
    prisma.town.findMany(),
  ]);
  const townsById = new Map(towns.map((town) => [town.id, town]));
  const formatted = insts.map((institution) => ({
    ...institution,
    town: institution.townId ? townsById.get(institution.townId) || null : null,
    townId: institution.townId || null,
  }));

  res.json(formatted);

}

export async function createInstitutions(req: AuthRequest, res: Response): Promise<any> {
  
  const { schoolCode, slug, nameAr, nameHe, typeId, regionId, statusId, defaultLanguageId, logoUrl, townId, brandingSettings } = req.body;

  if (!nameAr || !schoolCode || !typeId || !regionId || !statusId || !defaultLanguageId
    || ![typeId, regionId, statusId, defaultLanguageId].every(isUuid)) {
    return res.status(400).json({ error: 'بيانات المؤسسة المرجعية غير مكتملة أو تحتوي على معرفات غير صالحة.' });
  }

  const generatedSlug = slug || `school-${String(schoolCode).toLowerCase()}`;

  const inserted = await prisma.institution.create({
    data: {
      schoolCode,
      slug: generatedSlug,
      nameAr,
      nameHe: nameHe || null,
      typeId,
      regionId,
      statusId,
      defaultLanguageId,
      logoUrl: logoUrl || null,
      townId: townId || null,
      brandingSettings: brandingSettings || null,
    },
  });

  return res.json(inserted);

}

export async function updateInstitutionsById(req: AuthRequest, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const institutionId = await trustedInstitutionId(req);
  if (!institutionId || id !== institutionId) return res.status(403).json({ error: 'Unauthorized institution access.' });
  const { schoolCode, slug, nameAr, nameHe, typeId, regionId, statusId, defaultLanguageId, logoUrl, townId, brandingSettings } = req.body;

  if (![id, typeId, regionId, statusId, defaultLanguageId].every(isUuid)) {
    return res.status(400).json({ error: 'معرف المؤسسة أو أحد السجلات المرجعية غير صالح.' });
  }

  const updated = await prisma.institution.update({
    where: { id },
    data: {
      schoolCode,
      slug,
      nameAr,
      nameHe: nameHe || null,
      regionId,
      typeId,
      defaultLanguageId,
      statusId,
      logoUrl: logoUrl || null,
      townId: townId || null,
      brandingSettings: brandingSettings || null,
      updatedAt: new Date(),
    },
  });

  return res.json(updated);

}

export async function deleteInstitutionsById(req: AuthRequest, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const institutionId = await trustedInstitutionId(req);
  if (!institutionId || id !== institutionId) return res.status(403).json({ error: 'Unauthorized institution access.' });
  await prisma.institution.delete({ where: { id } });
  return res.json({ success: true });

}

export async function getAcademicYears(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context!.institutionId;
  const years = await prisma.academicYear.findMany({
    where: { institutionId: instId },
    orderBy: { startDate: 'desc' },
  });
  res.json(years);

}

export async function createAcademicYears(req: ContextRequest, res: Response): Promise<any> {
  
  const { yearLabel, startDate, endDate, isCurrent, isClosed } = req.body;
  const instId = req.context!.institutionId;

  const inserted = await prisma.$transaction(async (tx) => {
    if (isCurrent) {
      await tx.academicYear.updateMany({
        where: { institutionId: instId },
        data: { isCurrent: false },
      });
    }
    return tx.academicYear.create({
      data: {
        institutionId: instId,
        yearLabel,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isCurrent: isCurrent || false,
        isClosed: isClosed || false,
      },
    });
  });

  res.status(201).json(inserted);

}

export async function updateAcademicYearsById(req: ContextRequest, res: Response): Promise<any> {
  
  const { id } = req.params;
  const { yearLabel, startDate, endDate } = req.body;
  const instId = req.context!.institutionId;

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isCurrent') || Object.prototype.hasOwnProperty.call(req.body || {}, 'isClosed') || Object.prototype.hasOwnProperty.call(req.body || {}, 'archivedAt')) {
    return res.status(400).json({ error: 'Academic year state must be changed through its dedicated action.', code: 'ACADEMIC_YEAR_STATE_ACTION_REQUIRED' });
  }

  const existing = await prisma.academicYear.findFirst({ where: { id: id as string, institutionId: instId } });
  if (!existing) {
    return res.status(404).json({ error: 'Academic year not found or unauthorized' });
  }
  const updated = await prisma.$transaction(async (tx) => {
    return tx.academicYear.update({
      where: { id: existing.id },
      data: {
        yearLabel,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        updatedAt: new Date(),
      },
    });
  });
  res.json(updated);

}

export async function deleteAcademicYearsById(req: ContextRequest, res: Response): Promise<any> {
  
  const { id } = req.params;
  const instId = req.context!.institutionId;
  
  // Check if there are any enrollments attached to this academic year
  const hasEnrollments = await prisma.studentEnrollment.findFirst({ where: { academicYearId: id as string, institutionId: instId } });
  if (hasEnrollments) {
    return res.status(400).json({ error: '„״§ …ƒ† ״­״° ״§„״¹״§… ״§„״¯״±״§״³ „ˆ״¬ˆ״¯ ״·„״§״¨ …״³״¬„† ״¨‡.' });
  }

  const deleted = await prisma.academicYear.deleteMany({ where: { id: id as string, institutionId: instId } });

  if (deleted.count === 0) {
    return res.status(404).json({ error: 'Academic year not found or unauthorized' });
  }
  res.json({ success: true, deleted: { id } });

}

export async function getAcademicPeriods(req: ContextRequest, res: Response): Promise<any> {
  const instId = req.context!.institutionId;
  const requestedYearId = req.query['academicYearId'];
  const acadYearId = isUuid(requestedYearId) ? requestedYearId : req.context!.academicYearId;
  if (requestedYearId) {
    const academicYear = await prisma.academicYear.findFirst({ where: { id: acadYearId, institutionId: instId, archivedAt: null }, select: { id: true } });
    if (!academicYear) return res.status(404).json({ code: 'ACADEMIC_PERIOD_YEAR_NOT_FOUND', error: 'السنة الأكاديمية المحددة غير موجودة أو غير متاحة لهذه المؤسسة.' });
  }
  const periods = await prisma.academicPeriod.findMany({
    where: { institutionId: instId, academicYearId: acadYearId, archivedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
  res.json(periods);

}

type AcademicPeriodDateResult = { ok: true; start: Date; end: Date } | { ok: false; code: string; error: string };

function parseBusinessDate(value: unknown): Date | null {
  const raw = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw ? null : parsed;
}

export function validateAcademicPeriodDates(startDate: unknown, endDate: unknown, academicYear: { startDate: Date; endDate: Date }): AcademicPeriodDateResult {
  const start = parseBusinessDate(startDate);
  const end = parseBusinessDate(endDate);
  if (!start || !end) return { ok: false, code: 'ACADEMIC_PERIOD_DATES_INVALID', error: 'يجب إدخال تاريخي بداية ونهاية صالحين للفترة الدراسية.' };
  if (end.getTime() <= start.getTime()) return { ok: false, code: 'ACADEMIC_PERIOD_DATE_ORDER_INVALID', error: 'يجب أن يكون تاريخ انتهاء الفترة بعد تاريخ بدايتها.' };
  if (start.getTime() < academicYear.startDate.getTime() || end.getTime() > academicYear.endDate.getTime()) {
    return { ok: false, code: 'ACADEMIC_PERIOD_OUTSIDE_YEAR_RANGE', error: 'يجب أن تقع تواريخ الفترة الدراسية ضمن نطاق السنة الأكاديمية.' };
  }
  return { ok: true, start, end };
}

export async function createAcademicPeriods(req: ContextRequest, res: Response): Promise<any> {
  const { academicYearId, nameAr, nameHe, startDate, endDate, sortOrder, isActive } = req.body;
  const instId = req.context!.institutionId;
  const acadYearId = isUuid(academicYearId) ? academicYearId : req.context!.academicYearId;
  const academicYear = await prisma.academicYear.findFirst({ where: { id: acadYearId, institutionId: instId, archivedAt: null }, select: { startDate: true, endDate: true } });
  if (!academicYear) return res.status(404).json({ code: 'ACADEMIC_PERIOD_YEAR_NOT_FOUND', error: 'السنة الأكاديمية المحددة غير موجودة أو غير متاحة لهذه المؤسسة.' });
  if (!String(nameAr || '').trim()) return res.status(400).json({ code: 'ACADEMIC_PERIOD_NAME_REQUIRED', error: 'اسم الفترة الدراسية مطلوب.' });
  const dates = validateAcademicPeriodDates(startDate, endDate, academicYear);
  if (!dates.ok) return res.status(400).json({ code: dates.code, error: dates.error });

  const inserted = await prisma.academicPeriod.create({
    data: { institutionId: instId, academicYearId: acadYearId, nameAr: String(nameAr).trim(), nameHe: nameHe || null, startDate: dates.start, endDate: dates.end, sortOrder: Number(sortOrder) || 0, isActive: isActive !== undefined ? isActive : true },
  });

  res.status(201).json(inserted);

}

export async function updateAcademicPeriodsById(req: ContextRequest, res: Response): Promise<any> {
  
  const { id } = req.params;
  const { nameAr, nameHe, startDate, endDate, sortOrder, isActive } = req.body;
  const instId = req.context!.institutionId;

  const existing = await prisma.academicPeriod.findFirst({ where: { id: id as string, institutionId: instId, archivedAt: null } });
  if (!existing) {
    return res.status(404).json({ error: 'Academic period not found or unauthorized' });
  }
  const academicYear = await prisma.academicYear.findFirst({ where: { id: existing.academicYearId, institutionId: instId, archivedAt: null }, select: { startDate: true, endDate: true } });
  if (!academicYear) return res.status(404).json({ code: 'ACADEMIC_PERIOD_YEAR_NOT_FOUND', error: 'السنة الأكاديمية المحددة غير موجودة أو غير متاحة لهذه المؤسسة.' });
  const dates = validateAcademicPeriodDates(startDate, endDate, academicYear);
  if (!dates.ok) return res.status(400).json({ code: dates.code, error: dates.error });
  if (!String(nameAr || '').trim()) return res.status(400).json({ code: 'ACADEMIC_PERIOD_NAME_REQUIRED', error: 'اسم الفترة الدراسية مطلوب.' });
  const updated = await prisma.academicPeriod.update({
    where: { id: existing.id },
    data: {
      nameAr: String(nameAr).trim(),
      nameHe: nameHe || null,
      startDate: dates.start,
      endDate: dates.end,
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== undefined ? isActive : true,
      updatedAt: new Date(),
    },
  });
  res.json(updated);

}

export async function deleteAcademicPeriodsById(req: ContextRequest, res: Response): Promise<any> {
  
  const { id } = req.params;
  const instId = req.context!.institutionId;
  const existing = await prisma.academicPeriod.findFirst({ where: { id: id as string, institutionId: instId, archivedAt: null } });
  if (!existing) {
    return res.status(404).json({ error: 'Academic period not found or unauthorized' });
  }
  const archived = await prisma.academicPeriod.update({ where: { id: existing.id }, data: { archivedAt: new Date(), updatedAt: new Date() } });
  res.json({ success: true, archived: true, academicPeriod: archived });

}

export async function archiveAcademicYearsById(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = (req as AuthRequest & { context?: { institutionId: string } }).context?.institutionId || '';
  const id = String(req.params['id']);
  const existing = await prisma.academicYear.findFirst({ where: { id, institutionId, archivedAt: null } });
  if (!existing) {
    return res.status(404).json({ error: 'Academic year not found or unauthorized' });
  }
  if (existing.isCurrent) return res.status(400).json({ error: 'لا يمكن أرشفة السنة الدراسية الحالية. اختر سنة أخرى أولًا.' });

  const archived = await prisma.$transaction(async (tx) => {
    const result = await tx.academicYear.update({ where: { id: existing.id }, data: { archivedAt: new Date(), isCurrent: false, updatedAt: new Date() } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'ARCHIVE', entityType: 'AcademicYear', entityId: existing.id });
    return result;
  });
  return res.json({ success: true, archived: true, academicYear: archived });
}

export async function restoreAcademicYearsById(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = (req as AuthRequest & { context?: { institutionId: string } }).context?.institutionId || '';
  const id = String(req.params['id']);
  const existing = await prisma.academicYear.findFirst({ where: { id, institutionId, archivedAt: { not: null } } });
  if (!existing) return res.status(404).json({ error: 'السنة الدراسية المؤرشفة غير موجودة.' });
  const current = await prisma.academicYear.findFirst({ where: { institutionId, isCurrent: true, id: { not: id } }, select: { id: true } });
  if (current) return res.status(409).json({ error: 'لا يمكن الاستعادة مع وجود سنة دراسية حالية أخرى.' });
  const restored = await prisma.$transaction(async (tx) => {
    const result = await tx.academicYear.update({ where: { id }, data: { archivedAt: null, updatedAt: new Date() } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'RESTORE', entityType: 'AcademicYear', entityId: id });
    return result;
  });
  return res.json({ success: true, academicYear: restored });
}

export async function getLanguages(req: ContextRequest, res: Response): Promise<any> {
  const list = await prisma.language.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  });
  res.json(list.map((item) => ({ ...item, code: item.id })));

}

export async function createLanguages(req: AuthRequest, res: Response): Promise<any> {
  
  const { nameAr, nameHe, nativeName, direction, isActive, isSystem, sortOrder } = req.body;
  if (!nameAr || !nativeName) {
    return res.status(400).json({ error: 'Arabic Name and Native Name are required' });
  }

  const inserted = await prisma.language.create({
    data: {
      nameAr,
      nameHe: nameHe || null,
      nativeName,
      direction: direction || 'rtl',
      isActive: isActive !== undefined ? isActive : true,
      isSystem: isSystem !== undefined ? isSystem : false,
      sortOrder: Number(sortOrder) || 0,
    },
  });

  return res.status(201).json(inserted);

}

export async function updateLanguagesByCode(req: AuthRequest, res: Response): Promise<any> {
  
  const id = String(req.params['code']);
  const { nameAr, nameHe, nativeName, direction, isActive, isSystem, sortOrder } = req.body;

  const updated = await prisma.language.update({
    where: { id },
    data: {
      nameAr,
      nameHe: nameHe || null,
      nativeName,
      direction: direction || 'rtl',
      isActive: isActive !== undefined ? isActive : true,
      isSystem: isSystem !== undefined ? isSystem : false,
      sortOrder: Number(sortOrder) || 0,
      updatedAt: new Date(),
    },
  });

  return res.json({ ...updated, code: updated.id });

}

export async function getEducationTypes(req: ContextRequest, res: Response): Promise<any> {
  
  const list = await prisma.educationType.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  });
  res.json(list.map((item) => ({ ...item, code: item.id })));

}

export async function createEducationTypes(req: AuthRequest, res: Response): Promise<any> {
  
  const { nameAr, nameHe, isActive, sortOrder, isSystem } = req.body;
  if (!nameAr) {
    return res.status(400).json({ error: 'Arabic Name is required' });
  }

  const inserted = await prisma.educationType.create({
    data: {
      nameAr,
      nameHe: nameHe || null,
      isActive: isActive !== undefined ? isActive : true,
      isSystem: isSystem !== undefined ? isSystem : false,
      sortOrder: Number(sortOrder) || 0,
    },
  });

  return res.status(201).json(inserted);

}

export async function updateEducationTypesByCode(req: AuthRequest, res: Response): Promise<any> {
  
  const id = String(req.params['code']);
  const { nameAr, nameHe, isActive, sortOrder, isSystem } = req.body;

  const updated = await prisma.educationType.update({
    where: { id },
    data: {
      nameAr,
      nameHe: nameHe || null,
      isActive: isActive !== undefined ? isActive : true,
      isSystem: isSystem !== undefined ? isSystem : false,
      sortOrder: Number(sortOrder) || 0,
      updatedAt: new Date(),
    },
  });

  return res.json({ ...updated, code: updated.id });

}

export async function deleteEducationTypesByCode(req: AuthRequest, res: Response): Promise<any> {
  
  const id = String(req.params['code']);

  await prisma.educationType.delete({ where: { id } });

  return res.json({ success: true });

}

export async function getRegions(req: ContextRequest, res: Response): Promise<any> {
  
  const list = await prisma.region.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  });
  res.json(list.map((item) => ({ ...item, code: item.id })));

}

export async function createRegions(req: AuthRequest, res: Response): Promise<any> {
  
  const { nameAr, nameHe, isActive, sortOrder } = req.body;
  if (!nameAr) {
    return res.status(400).json({ error: 'Arabic Name is required' });
  }

  const inserted = await prisma.region.create({
    data: {
      nameAr,
      nameHe: nameHe || null,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: Number(sortOrder) || 0,
    },
  });

  return res.status(201).json(inserted);

}

export async function updateRegionsByCode(req: AuthRequest, res: Response): Promise<any> {
  
  const id = String(req.params['code']);
  const { nameAr, nameHe, isActive, sortOrder } = req.body;

  const updated = await prisma.region.update({
    where: { id },
    data: {
      nameAr,
      nameHe: nameHe || null,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: Number(sortOrder) || 0,
      updatedAt: new Date(),
    },
  });

  return res.json({ ...updated, code: updated.id });

}

export async function deleteRegionsByCode(req: AuthRequest, res: Response): Promise<any> {
  
  const id = String(req.params['code']);

  await prisma.region.delete({ where: { id } });

  return res.json({ success: true });

}

export async function getAppState(req: ContextRequest, res: Response): Promise<any> {
  const instId = req.context?.institutionId || '';
  const record = await prisma.appState.findUnique({ where: { institutionId: instId } });

  if (!record) {
    const inserted = await prisma.appState.create({ data: {
      institutionId: instId,
      data: {
        registrationOpen: true,
        academicYearStatus: 'ACTIVE',
        allowedIpRanges: ['*'],
        systemMaintenance: false,
        theme: 'light',
        gradeEntryDeadline: '2026-06-30'
      }
    } });
    return res.json(inserted);
  }

  return res.json(record);

}

export async function updateAppState(req: AuthRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  const { data } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'Data is required' });
  }

  const updated = await prisma.appState.updateMany({
    where: { institutionId: instId },
    data: {
      data,
      updatedAt: new Date()
    },
  });

  if (updated.count === 0) {
    const inserted = await prisma.appState.create({ data: {
      institutionId: instId,
      data
    } });
    return res.json(inserted);
  }

  return res.json(await prisma.appState.findUnique({ where: { institutionId: instId } }));

}
