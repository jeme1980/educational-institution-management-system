import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { ContextRequest } from '../middleware/context';
import { AuthRequest } from '../middleware/auth';
import { recordAuditEvent } from '../services/audit.service';

const institutionIdFrom = (req: { institutionId?: string; context?: { institutionId?: string } }) =>
  req.institutionId || req.context?.institutionId || '';

const uuid = (value: unknown): string | null => {
  const text = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
};

function isUniqueViolationError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const defaultJobRoleNames = new Map<number, string>([
  [1, 'معلم'],
  [2, 'معلم صف'],
  [3, 'مدير مدرسة'],
  [4, 'نائب مدير'],
  [5, 'مستشار تربوي'],
  [6, 'سكرتير / إداري'],
]);

function cleanJobRoleName(name: string, sortOrder: number): string {
  // Mojibake may not contain the marker characters used by the old data,
  // so require at least one real Arabic letter before returning the value.
  return /[\u0600-\u06ff]/.test(name) ? name : (defaultJobRoleNames.get(sortOrder) || 'دور وظيفي');
}

export async function getStaff(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = institutionIdFrom(req);
  const includeArchived = String(req.query.archived || '') === 'all';
  const staff = await prisma.staffMember.findMany({ where: { institutionId, ...(includeArchived ? {} : { archivedAt: null }) }, include: { specialization: { select: { id: true, nameAr: true, nameHe: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(staff);
}

export async function createStaff(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = institutionIdFrom(req);
  const { nationalId, firstNameAr, firstNameHe, familyNameAr, familyNameHe, genderId, specializationId, phoneNumber, email, archivedAt } = req.body;
  if (!uuid(institutionId) || !String(firstNameAr || '').trim() || !String(familyNameAr || '').trim()) return res.status(400).json({ error: 'المؤسسة والاسم الأول واسم العائلة حقول مطلوبة وصحيحة.' });
  if (genderId && (!uuid(genderId) || !(await prisma.gender.findFirst({ where: { id: genderId, isActive: true } })))) return res.status(400).json({ error: 'الجنس المحدد غير صالح.' });
  if (specializationId && (!uuid(specializationId) || !(await prisma.specialization.findFirst({ where: { id: specializationId, institutionId, isActive: true } })))) return res.status(400).json({ error: 'التخصص المحدد غير صالح.' });
  const inserted = await prisma.staffMember.create({
    data: {
      institutionId,
      nationalId: nationalId || null,
      firstNameAr: firstNameAr || '…ˆ״¸',
      firstNameHe: firstNameHe || null,
      familyNameAr: familyNameAr || '״¬״¯״¯',
      familyNameHe: familyNameHe || null,
      genderId: genderId || null,
      specializationId: specializationId || null,
      phoneNumber: phoneNumber || null,
      email: email || null,
      createdBy: uuid(req.user?.uid),
      archivedAt: archivedAt ? new Date(archivedAt) : null,
    },
  });
  res.status(201).json(inserted);
}

export async function updateStaffById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const institutionId = institutionIdFrom(req);
  const { nationalId, firstNameAr, firstNameHe, familyNameAr, familyNameHe, genderId, specializationId, phoneNumber, email, archivedAt } = req.body;
  const existing = await prisma.staffMember.findFirst({ where: { id, institutionId } });
  if (!existing) return res.status(404).json({ error: 'Staff member not found' });
  if (!uuid(institutionId) || !String(firstNameAr || '').trim() || !String(familyNameAr || '').trim()) return res.status(400).json({ error: 'المؤسسة والاسم الأول واسم العائلة حقول مطلوبة وصحيحة.' });
  if (genderId && (!uuid(genderId) || !(await prisma.gender.findFirst({ where: { id: genderId, isActive: true } })))) return res.status(400).json({ error: 'الجنس المحدد غير صالح.' });
  if (specializationId && (!uuid(specializationId) || !(await prisma.specialization.findFirst({ where: { id: specializationId, institutionId, isActive: true } })))) return res.status(400).json({ error: 'التخصص المحدد غير صالح.' });
  const updated = await prisma.staffMember.update({
    where: { id: existing.id },
    data: {
      nationalId: nationalId !== undefined ? nationalId : null,
      firstNameAr,
      firstNameHe: firstNameHe !== undefined ? firstNameHe : null,
      familyNameAr,
      familyNameHe: familyNameHe !== undefined ? familyNameHe : null,
      genderId: genderId !== undefined ? genderId : null,
      specializationId: specializationId !== undefined ? specializationId : null,
      phoneNumber: phoneNumber !== undefined ? phoneNumber : null,
      email: email !== undefined ? email : null,
      institutionId,
      updatedAt: new Date(),
      updatedBy: uuid(req.user?.uid),
      archivedAt: archivedAt ? new Date(archivedAt) : null,
    },
  });
  return res.json(updated);
}

export async function deleteStaffById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const existing = await prisma.staffMember.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'Staff member not found' });
  await prisma.$transaction(async (tx) => {
    await tx.staffMember.update({ where: { id: existing.id }, data: { archivedAt: new Date(), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
    await recordAuditEvent(tx, { institutionId: existing.institutionId, actorUserId: req.user?.uid, action: 'ARCHIVE', entityType: 'StaffMember', entityId: existing.id });
  });
  return res.json({ message: 'Staff member archived successfully', archived: true, id });
}

export async function restoreStaffById(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = institutionIdFrom(req);
  const existing = await prisma.staffMember.findFirst({ where: { id: String(req.params.id), institutionId, archivedAt: { not: null } } });
  if (!existing) return res.status(404).json({ error: 'الموظف المؤرشف غير موجود.' });
  const restored = await prisma.$transaction(async (tx) => {
    const result = await tx.staffMember.update({ where: { id: existing.id }, data: { archivedAt: null, updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'RESTORE', entityType: 'StaffMember', entityId: existing.id });
    return result;
  });
  return res.json({ success: true, staff: restored });
}

export async function getJobRoles(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = institutionIdFrom(req);
  let roles = await prisma.jobRole.findMany({ where: { institutionId }, orderBy: { sortOrder: 'asc' } });
  if (roles.length === 0) {
    const defaults = [
      { nameAr: 'معلم', nameHe: 'מורה מקצועי', isTeachingRole: true, sortOrder: 1 },
      { nameAr: 'معلم صف', nameHe: 'מחנך', isTeachingRole: true, sortOrder: 2 },
      { nameAr: 'مدير مدرسة', nameHe: 'מנהל בית ספר', isTeachingRole: false, sortOrder: 3 },
      { nameAr: 'نائب مدير', nameHe: 'סגן מנהל', isTeachingRole: false, sortOrder: 4 },
      { nameAr: 'مستشار تربوي', nameHe: 'יועץ חינוכי', isTeachingRole: false, sortOrder: 5 },
      { nameAr: 'سكرتير / إداري', nameHe: 'מזכיר', isTeachingRole: false, sortOrder: 6 },
    ];
    roles = await prisma.$transaction(defaults.map((role) => prisma.jobRole.create({ data: { institutionId, ...role, isActive: true } })));
  }
  return res.json(roles.map((role) => ({ ...role, nameAr: cleanJobRoleName(role.nameAr, role.sortOrder), code: role.id })));
}

export async function createJobRoles(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = institutionIdFrom(req);
  const { nameAr, nameHe, isTeachingRole, isActive, sortOrder } = req.body || {};
  const normalizedInstitutionId = uuid(institutionId);
  const normalizedName = String(nameAr || '').trim();
  if (!normalizedInstitutionId || !normalizedName) return res.status(400).json({ error: 'المؤسسة والاسم العربي للمسمى الوظيفي مطلوبان.' });
  try {
    const inserted = await prisma.jobRole.create({
      data: {
        institutionId: normalizedInstitutionId,
        nameAr: normalizedName,
        nameHe: String(nameHe || '').trim() || null,
        isTeachingRole: isTeachingRole === true,
        isActive: isActive !== false,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        createdBy: uuid(req.user?.uid),
      },
    });
    return res.status(201).json({ ...inserted, code: inserted.id });
  } catch (error) {
    console.error('[POST /api/job-roles]', error);
    return res.status(isUniqueViolationError(error) ? 409 : 400).json({ error: 'تعذر حفظ المسمى الوظيفي.' });
  }
}

export async function updateJobRolesById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const institutionId = institutionIdFrom(req);
  const { nameAr, nameHe, isTeachingRole, isActive, sortOrder, archivedAt } = req.body;
  const normalizedInstitutionId = uuid(institutionId);
  const normalizedName = String(nameAr || '').trim();
  if (!normalizedInstitutionId || !normalizedName) return res.status(400).json({ error: 'المؤسسة والاسم العربي للمسمى الوظيفي مطلوبان.' });
  const existing = await prisma.jobRole.findFirst({ where: { id, institutionId: normalizedInstitutionId } });
  if (!existing) return res.status(404).json({ error: 'Job role not found' });
  try {
    const updated = await prisma.jobRole.update({
      where: { id: existing.id },
      data: {
        nameAr: normalizedName, nameHe: String(nameHe || '').trim() || null,
        isTeachingRole: isTeachingRole === true,
        isActive: isActive !== false,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        archivedAt: archivedAt ? new Date(archivedAt) : null,
        updatedAt: new Date(), updatedBy: uuid(req.user?.uid),
      },
    });
    return res.json({ ...updated, code: updated.id });
  } catch (error) {
    console.error('[PUT /api/job-roles/:id]', error);
    return res.status(isUniqueViolationError(error) ? 409 : 400).json({ error: 'تعذر حفظ المسمى الوظيفي.' });
  }
}

export async function deleteJobRolesById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const existing = await prisma.jobRole.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'Job role not found' });
  await prisma.jobRole.delete({ where: { id: existing.id } });
  return res.json({ message: 'Job role deleted successfully', id });
}

async function assignmentResponse(institutionId: string, academicYearId?: string) {
  const assignments = await prisma.staffAssignment.findMany({
    where: { institutionId, ...(academicYearId ? { academicYearId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const staffIds = [...new Set(assignments.map((assignment) => assignment.staffMemberId))];
  const roleIds = [...new Set(assignments.map((assignment) => assignment.jobRoleId))];
  const yearIds = [...new Set(assignments.map((assignment) => assignment.academicYearId))];
  const [staff, roles, years, subjectLinks] = await Promise.all([
    prisma.staffMember.findMany({ where: { institutionId, id: { in: staffIds } } }),
    prisma.jobRole.findMany({ where: { institutionId, id: { in: roleIds } } }),
    prisma.academicYear.findMany({ where: { institutionId, id: { in: yearIds } } }),
    prisma.staffAssignmentSubject.findMany({
      where: { institutionId, staffAssignmentId: { in: assignments.map((assignment) => assignment.id) } },
      include: { subject: true },
    }),
  ]);
  const staffById = new Map(staff.map((item) => [item.id, item]));
  const roleById = new Map(roles.map((item) => [item.id, item]));
  const yearById = new Map(years.map((item) => [item.id, item]));
  const subjectsByAssignment = new Map<string, typeof subjectLinks>();
  for (const link of subjectLinks) {
    const links = subjectsByAssignment.get(link.staffAssignmentId) || [];
    links.push(link);
    subjectsByAssignment.set(link.staffAssignmentId, links);
  }
  return assignments.map((assignment) => ({
    ...assignment,
    staffFirstNameAr: staffById.get(assignment.staffMemberId)?.firstNameAr || null,
    staffFamilyNameAr: staffById.get(assignment.staffMemberId)?.familyNameAr || null,
    jobRoleNameAr: roleById.get(assignment.jobRoleId)?.nameAr || null,
    academicYearLabel: yearById.get(assignment.academicYearId)?.yearLabel || null,
    subjectIds: (subjectsByAssignment.get(assignment.id) || []).map((link) => link.subjectId),
    subjects: (subjectsByAssignment.get(assignment.id) || []).map((link) => link.subject),
  }));
}

function requestedSubjectIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((subjectId): subjectId is string => typeof subjectId === 'string' && subjectId.trim().length > 0))];
}

async function validateSubjects(institutionId: string, academicYearId: string, subjectIds: string[]): Promise<boolean> {
  if (subjectIds.length === 0) return true;
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds }, institutionId, academicYearId },
    select: { id: true },
  });
  return subjects.length === subjectIds.length;
}

function subjectLinksData(institutionId: string, staffAssignmentId: string, subjectIds: string[]) {
  return subjectIds.map((subjectId) => ({ institutionId, staffAssignmentId, subjectId }));
}

export async function getStaffAssignments(req: ContextRequest, res: Response): Promise<any> {
  return res.json(await assignmentResponse(institutionIdFrom(req), req.context?.academicYearId));
}

export async function createStaffAssignments(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = institutionIdFrom(req);
  const { academicYearId, staffMemberId, jobRoleId, startDate, endDate, isPrimary, isActive, notes, archivedAt } = req.body;
  const subjectIds = requestedSubjectIds(req.body.subjects ?? req.body.subjectIds) || [];
  try {
    const [staff, role, year] = await Promise.all([
      prisma.staffMember.findFirst({ where: { id: staffMemberId, institutionId } }),
      prisma.jobRole.findFirst({ where: { id: jobRoleId, institutionId } }),
      prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId } }),
    ]);
    if (!staff || !role || !year || !(await validateSubjects(institutionId, academicYearId, subjectIds))) {
      return res.status(400).json({ error: 'Staff, job role, academic year, and subjects must belong to the current institution and academic year' });
    }
    const inserted = await prisma.$transaction(async (tx) => {
      const assignment = await tx.staffAssignment.create({
        data: { institutionId, academicYearId, staffMemberId, jobRoleId, startDate: startDate ? new Date(startDate) : new Date(), endDate: endDate ? new Date(endDate) : null, isPrimary: isPrimary !== undefined ? Boolean(isPrimary) : false, isActive: isActive !== undefined ? Boolean(isActive) : true, notes: notes || null, createdBy: uuid(req.user?.uid), archivedAt: archivedAt ? new Date(archivedAt) : null },
      });
      if (subjectIds.length > 0) {
        await tx.staffAssignmentSubject.createMany({ data: subjectLinksData(institutionId, assignment.id, subjectIds) });
      }
      return assignment;
    });
    return res.status(201).json((await assignmentResponse(institutionId)).find((assignment) => assignment.id === inserted.id));
  } catch (error) {
    if (isUniqueViolationError(error)) return res.status(409).json({ error: 'This staff member is already assigned for the selected institution and academic year.' });
    console.error('Failed to create staff assignment', error);
    return res.status(500).json({ error: 'Failed to create staff assignment' });
  }
}

export async function updateStaffAssignmentsById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const institutionId = institutionIdFrom(req);
  const { academicYearId, staffMemberId, jobRoleId, startDate, endDate, isPrimary, isActive, notes, archivedAt } = req.body;
  const requestedSubjects = requestedSubjectIds(req.body.subjects ?? req.body.subjectIds);
  try {
    const existing = await prisma.staffAssignment.findFirst({ where: { id, institutionId } });
    if (!existing) return res.status(404).json({ error: 'Staff assignment not found' });
    const [staff, role, year] = await Promise.all([
      prisma.staffMember.findFirst({ where: { id: staffMemberId, institutionId } }),
      prisma.jobRole.findFirst({ where: { id: jobRoleId, institutionId } }),
      prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId } }),
    ]);
    if (!staff || !role || !year || (requestedSubjects && !(await validateSubjects(institutionId, academicYearId, requestedSubjects)))) {
      return res.status(400).json({ error: 'Staff, job role, academic year, and subjects must belong to the current institution and academic year' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.update({
        where: { id: existing.id },
        data: { institutionId, academicYearId, staffMemberId, jobRoleId, startDate: startDate ? new Date(startDate) : new Date(), endDate: endDate ? new Date(endDate) : null, isPrimary: isPrimary !== undefined ? Boolean(isPrimary) : false, isActive: isActive !== undefined ? Boolean(isActive) : true, notes: notes !== undefined ? notes : null, updatedAt: new Date(), updatedBy: uuid(req.user?.uid), archivedAt: archivedAt ? new Date(archivedAt) : null },
      });
      if (requestedSubjects) {
        await tx.staffAssignmentSubject.deleteMany({ where: { institutionId, staffAssignmentId: existing.id } });
        if (requestedSubjects.length > 0) {
          await tx.staffAssignmentSubject.createMany({ data: subjectLinksData(institutionId, existing.id, requestedSubjects) });
        }
      }
    });
    return res.json((await assignmentResponse(institutionId)).find((assignment) => assignment.id === existing.id));
  } catch (error) {
    if (isUniqueViolationError(error)) return res.status(409).json({ error: 'This staff member is already assigned for the selected institution and academic year.' });
    console.error('Failed to update staff assignment', error);
    return res.status(500).json({ error: 'Failed to update staff assignment' });
  }
}

export async function deleteStaffAssignmentsById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const existing = await prisma.staffAssignment.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'Staff assignment not found' });
  await prisma.staffAssignment.delete({ where: { id: existing.id } });
  return res.json({ message: 'Staff assignment deleted successfully', id });
}

function developmentResponse(institutionId: string) {
  return prisma.staffDevelopment.findMany({
    where: { institutionId },
    include: {
      staffMember: {
        select: {
          id: true,
          firstNameAr: true,
          familyNameAr: true,
          nationalId: true,
          specialization: { select: { id: true, nameAr: true, nameHe: true } },
        },
      },
      provider: { select: { id: true, providerCode: true, name: true } },
    },
    orderBy: [{ startDate: 'desc' }, { courseName: 'asc' }],
  });
}

function validDate(value: unknown): Date | null {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function developmentData(body: Record<string, unknown>) {
  const courseCode = String(body.courseCode || '').trim();
  const courseName = String(body.courseName || '').trim();
  const providerId = String(body.providerId || '').trim() || null;
  const hoursCount = body.hoursCount === null || body.hoursCount === undefined || body.hoursCount === '' ? null : Number(body.hoursCount);
  const startDate = validDate(body.startDate);
  const endDate = validDate(body.endDate);
  return { courseCode, courseName, providerId, hoursCount, startDate, endDate };
}

export async function getStaffDevelopments(req: ContextRequest, res: Response): Promise<any> {
  return res.json(await developmentResponse(institutionIdFrom(req)));
}

export async function createStaffDevelopment(req: AuthRequest, res: Response): Promise<any> {
  const institutionId = institutionIdFrom(req);
  const staffMemberId = String(req.body?.staffMemberId || '');
  const data = developmentData(req.body || {});
  if (!uuid(institutionId) || !uuid(staffMemberId) || !data.courseCode || data.courseCode.length > 20 || !data.courseName || data.courseName.length > 200 || !data.startDate || !data.endDate || (data.hoursCount !== null && (!Number.isInteger(data.hoursCount) || data.hoursCount < 0))) {
    return res.status(400).json({ error: 'بيانات الاستكمال غير مكتملة أو غير صحيحة.' });
  }
  if (data.endDate < data.startDate) return res.status(400).json({ error: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية.' });
  const staff = await prisma.staffMember.findFirst({ where: { id: staffMemberId, institutionId } });
  if (!staff) return res.status(400).json({ error: 'الموظف المحدد لا ينتمي إلى المؤسسة الحالية.' });
  if (data.providerId && !uuid(data.providerId)) return res.status(400).json({ error: 'الجهة المقدمة المحددة غير صحيحة.' });
  if (data.providerId && !(await prisma.provider.findFirst({ where: { id: data.providerId, isActive: true } }))) return res.status(400).json({ error: 'الجهة المقدمة غير موجودة أو غير فعالة.' });
  try {
    const created = await prisma.staffDevelopment.create({ data: { institutionId, staffMemberId, courseCode: data.courseCode, courseName: data.courseName, providerId: data.providerId, hoursCount: data.hoursCount, startDate: data.startDate, endDate: data.endDate, createdBy: uuid(req.user?.uid) } });
    return res.status(201).json(created);
  } catch (error) {
    if (isUniqueViolationError(error)) return res.status(409).json({ error: 'رمز الدورة مستخدم مسبقًا لهذا الموظف.' });
    console.error('Failed to create staff development', error);
    return res.status(500).json({ error: 'تعذر حفظ الاستكمال.' });
  }
}

export async function updateStaffDevelopment(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id'] || '');
  const institutionId = institutionIdFrom(req);
  const staffMemberId = String(req.body?.staffMemberId || '');
  const data = developmentData(req.body || {});
  const existing = await prisma.staffDevelopment.findFirst({ where: { id, institutionId } });
  if (!existing) return res.status(404).json({ error: 'سجل الاستكمال غير موجود.' });
  if (!uuid(staffMemberId) || !data.courseCode || !data.courseName || !data.startDate || !data.endDate || (data.hoursCount !== null && (!Number.isInteger(data.hoursCount) || data.hoursCount < 0))) return res.status(400).json({ error: 'بيانات الاستكمال غير صحيحة.' });
  if (data.endDate < data.startDate) return res.status(400).json({ error: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية.' });
  const staff = await prisma.staffMember.findFirst({ where: { id: staffMemberId, institutionId } });
  if (!staff) return res.status(400).json({ error: 'الموظف المحدد لا ينتمي إلى المؤسسة الحالية.' });
  if (data.providerId && !uuid(data.providerId)) return res.status(400).json({ error: 'الجهة المقدمة المحددة غير صحيحة.' });
  if (data.providerId && !(await prisma.provider.findFirst({ where: { id: data.providerId, isActive: true } }))) return res.status(400).json({ error: 'الجهة المقدمة غير موجودة أو غير فعالة.' });
  try {
    return res.json(await prisma.staffDevelopment.update({ where: { id }, data: { staffMemberId, courseCode: data.courseCode, courseName: data.courseName, providerId: data.providerId, hoursCount: data.hoursCount, startDate: data.startDate, endDate: data.endDate, updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } }));
  } catch (error) {
    if (isUniqueViolationError(error)) return res.status(409).json({ error: 'رمز الدورة مستخدم مسبقًا لهذا الموظف.' });
    console.error('Failed to update staff development', error);
    return res.status(500).json({ error: 'تعذر تحديث الاستكمال.' });
  }
}

export async function deleteStaffDevelopment(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id'] || '');
  const existing = await prisma.staffDevelopment.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'سجل الاستكمال غير موجود.' });
  await prisma.staffDevelopment.delete({ where: { id } });
  return res.json({ success: true, id });
}
