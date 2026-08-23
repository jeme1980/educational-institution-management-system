import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';
import { AttendanceStatus } from '@prisma/client';
import { AttendanceInput } from '../validation/attendance.schemas';

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function resolveStudentStatusId(tx: any, value?: string | null): Promise<string> {
  const match = isUuid(value) ? await tx.studentStatus.findUnique({ where: { id: value } }) : null;
  if (match) return match.id;
  const fallback = await tx.studentStatus.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  if (!fallback) throw new Error('„״§ ˆ״¬״¯ ˆ״¶״¹ ״·״§„״¨ ״¹״§„  ״§„״¬״¯״§ˆ„ ״§„…״³״§״¹״¯״©.');
  return fallback.id;
}

async function resolveGenderId(tx: any, value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (isUuid(value) && await tx.gender.findUnique({ where: { id: value } })) return value;
  const fallback = await tx.gender.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  return fallback?.id || null;
}

async function resolveRelationTypeId(tx: any, value?: string | null): Promise<string> {
  if (isUuid(value) && await tx.relationType.findUnique({ where: { id: value } })) return value;
  const fallback = await tx.relationType.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  if (!fallback) throw new Error('„״§ ˆ״¬״¯ †ˆ״¹ ‚״±״§״¨״© ״¹״§„  ״§„״¬״¯״§ˆ„ ״§„…״³״§״¹״¯״©.');
  return fallback.id;
}

async function resolveStrictRelationTypeId(tx: any, value?: string | null): Promise<string> {
  if (isUuid(value)) {
    const relationType = await tx.relationType.findFirst({ where: { id: value, isActive: true } });
    if (relationType) return relationType.id;
  }
  throw new Error('INVALID_RELATION_TYPE');
}

async function resolveEnrollmentStatusId(tx: any): Promise<string> {
  const fallback = await tx.enrollmentStatus.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  if (!fallback) throw new Error('„״§ ˆ״¬״¯ ˆ״¶״¹ ״×״³״¬„ ״¹״§„  ״§„״¬״¯״§ˆ„ ״§„…״³״§״¹״¯״©.');
  return fallback.id;
}

export async function getStudents(req: ContextRequest, res: Response): Promise<any> {
  const instId = req.context!.institutionId;
  const acadYearId = req.context!.academicYearId;
  const includeArchived = String(req.query['archived'] || '') === 'all';
  const searchQuery = String(req.query['search'] || '').trim();
  const classId = String(req.query['classId'] || '').trim();
  const statusId = String(req.query['statusId'] || '').trim();
  const genderId = String(req.query['genderId'] || '').trim();
  const sortBy = String(req.query['sortBy'] || 'createdAt');
  const sortDirection = String(req.query['sortDirection'] || 'desc') === 'asc' ? 'asc' : 'desc';
  const requestedPage = Number.parseInt(String(req.query['page'] || '1'), 10);
  const requestedLimit = Number.parseInt(String(req.query['limit'] || '25'), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 25;
  const offset = (page - 1) * limit;
  const guardianSearchIds = searchQuery
    ? (await prisma.guardian.findMany({
        where: {
          institutionId: instId,
          OR: [
            { firstNameAr: { contains: searchQuery, mode: 'insensitive' } },
            { lastNameAr: { contains: searchQuery, mode: 'insensitive' } },
            { primaryPhoneNumber: { contains: searchQuery, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      })).map((guardian) => guardian.id)
    : [];
  const guardianStudentIds = guardianSearchIds.length
    ? (await prisma.studentGuardian.findMany({
        where: { institutionId: instId, isPrimaryContact: true, guardianId: { in: guardianSearchIds } },
        select: { studentId: true },
      })).map((link) => link.studentId)
    : [];
  const where = {
    institutionId: instId,
    ...(includeArchived ? {} : { isActive: true }),
    ...(statusId ? { studentStatusId: statusId } : {}),
    ...(genderId ? { genderId } : {}),
    ...(classId ? {
      studentEnrollments: {
        some: { institutionId: instId, academicYearId: acadYearId, classId, isActive: true, isDeleted: false },
      },
    } : {}),
    ...(searchQuery ? {
      OR: [
        { firstNameAr: { contains: searchQuery, mode: 'insensitive' as const } },
        { lastNameAr: { contains: searchQuery, mode: 'insensitive' as const } },
        { nationalId: { contains: searchQuery, mode: 'insensitive' as const } },
        { phoneNumber: { contains: searchQuery, mode: 'insensitive' as const } },
        { addressAr: { contains: searchQuery, mode: 'insensitive' as const } },
        ...(guardianStudentIds.length ? [{ id: { in: guardianStudentIds } }] : []),
      ],
    } : {}),
  };
  const orderBy: any = sortBy === 'nameAr'
    ? [{ firstNameAr: sortDirection }, { lastNameAr: sortDirection }]
    : sortBy === 'birthDate'
      ? { birthDate: sortDirection }
      : sortBy === 'nationalId'
        ? { nationalId: sortDirection }
        : { createdAt: sortDirection };
  const studentsPage = await prisma.student.findMany({
    where,
    orderBy,
    take: limit,
    skip: offset,
  });
  const total = await prisma.student.count({ where });
  const studentIds = studentsPage.map((student) => student.id);
  const [enrollments, guardianLinks, towns] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where: { studentId: { in: studentIds }, institutionId: instId, isDeleted: false, isActive: true, academicYearId: acadYearId },
    }),
    prisma.studentGuardian.findMany({ where: { studentId: { in: studentIds }, institutionId: instId, isPrimaryContact: true } }),
    prisma.town.findMany({ where: { id: { in: studentsPage.map((student) => student.townId).filter((id): id is string => Boolean(id)) } } }),
  ]);
  const guardianIds = guardianLinks.map((link) => link.guardianId);
  const guardians = await prisma.guardian.findMany({ where: { id: { in: guardianIds }, institutionId: instId } });
  const enrollmentByStudent = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment]));
  const linkByStudent = new Map(guardianLinks.map((link) => [link.studentId, link]));
  const guardianById = new Map(guardians.map((guardian) => [guardian.id, guardian]));
  const townById = new Map(towns.map((town) => [town.id, town]));
  const students = studentsPage.map((student) => {
    const enrollment = enrollmentByStudent.get(student.id);
    const link = linkByStudent.get(student.id);
    return {
      ...student,
      classId: enrollment?.classId || null,
      guardian: link ? guardianById.get(link.guardianId) || null : null,
      relationTypeId: link?.relationTypeId || null,
      town: student.townId ? townById.get(student.townId) || null : null,
      townId: student.townId || null,
    };
  });
  res.json({
    data: students,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });

}

export async function getStudentsById(req: ContextRequest, res: Response): Promise<any> {
  const instId = req.context!.institutionId;
  const academicYearId = req.context!.academicYearId;
  const id = String(req.params['id']);
  const student = await prisma.student.findFirst({ where: { id, institutionId: instId } });
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const [enrollment, medicalProfile, guardianLink, town] = await Promise.all([
    prisma.studentEnrollment.findFirst({ where: { studentId: id, institutionId: instId, academicYearId, isDeleted: false, isActive: true }, orderBy: { createdAt: 'desc' } }),
    prisma.studentMedicalProfile.findUnique({ where: { institutionId_studentId: { institutionId: instId, studentId: id } } }),
    prisma.studentGuardian.findFirst({ where: { studentId: id, institutionId: instId, isPrimaryContact: true } }),
    student.townId ? prisma.town.findUnique({ where: { id: student.townId } }) : null,
  ]);
  const guardian = guardianLink ? await prisma.guardian.findUnique({ where: { id: guardianLink.guardianId } }) : null;
  return res.json({ ...student, classId: enrollment?.classId || null, medicalProfile, guardian, relationTypeId: guardianLink?.relationTypeId || null, town: town || null });
}

function guardianDataFromInput(input: any) {
  return {
    nationalId: input.nationalId?.trim() || null,
    firstNameAr: input.firstNameAr?.trim() || '',
    lastNameAr: input.lastNameAr?.trim() || '',
    firstNameHe: input.firstNameHe?.trim() || null,
    lastNameHe: input.lastNameHe?.trim() || null,
    primaryPhoneNumber: input.primaryPhoneNumber?.trim() || '',
    secondaryPhoneNumber: input.secondaryPhoneNumber?.trim() || null,
    email: input.email?.trim() || null,
    addressAr: input.addressAr?.trim() || null,
    addressHe: input.addressHe?.trim() || null,
    jobTitleAr: input.jobTitleAr?.trim() || null,
    jobTitleHe: input.jobTitleHe?.trim() || null,
  };
}

async function ensureStudentInInstitution(institutionId: string, studentId: string) {
  return prisma.student.findFirst({ where: { id: studentId, institutionId }, select: { id: true } });
}

async function ensureActiveStudentInInstitution(institutionId: string, studentId: string) {
  return prisma.student.findFirst({ where: { id: studentId, institutionId, isActive: true }, select: { id: true } });
}

export async function getRelationTypes(_req: ContextRequest, res: Response): Promise<any> {
  return res.json(await prisma.relationType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }] }));
}

export async function getStudentGuardians(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const studentId = req.params['id'] as string;
  if (!await ensureStudentInInstitution(institutionId, studentId)) return res.status(404).json({ error: 'Student not found' });
  const links = await prisma.studentGuardian.findMany({
    where: { institutionId, studentId },
    include: { guardian: true, relationType: true },
    orderBy: [{ isPrimaryContact: 'desc' }, { createdAt: 'asc' }],
  });
  return res.json(links);
}

export async function createStudentGuardian(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const studentId = req.params['id'] as string;
  const input = req.body;
  if (!await ensureActiveStudentInInstitution(institutionId, studentId)) return res.status(404).json({ error: 'Student is archived or inactive.' });
  try {
    let guardianCreated = false;
    const link = await prisma.$transaction(async (tx) => {
      let guardian = input.guardianId
        ? await tx.guardian.findFirst({ where: { id: input.guardianId, institutionId, isDeleted: false, isActive: true } })
        : null;
      if (input.guardianId && !guardian) throw new Error('Guardian does not belong to the current institution');
      if (!guardian) {
        const data = guardianDataFromInput(input);
        guardian = await tx.guardian.findFirst({ where: { institutionId, isDeleted: false, OR: [
          ...(data.nationalId ? [{ nationalId: data.nationalId }] : []),
          ...(data.primaryPhoneNumber ? [{ primaryPhoneNumber: data.primaryPhoneNumber }] : []),
          ...(data.email ? [{ email: data.email }] : []),
        ] } });
        if (!guardian) { guardian = await tx.guardian.create({ data: { institutionId, ...data, isActive: true } }); guardianCreated = true; }
      }
      const isPrimary = input.isPrimaryContact ?? false;
      if (isPrimary) await tx.studentGuardian.updateMany({ where: { institutionId, studentId, isPrimaryContact: true }, data: { isPrimaryContact: false } });
      return tx.studentGuardian.create({
        data: {
          institutionId, studentId, guardianId: guardian.id,
          relationTypeId: await resolveStrictRelationTypeId(tx, input.relationTypeId),
          isPrimaryContact: isPrimary,
          isFinancialResponsible: Boolean(input.isFinancialResponsible),
          hasCustody: Boolean(input.hasCustody),
          canPickup: Boolean(input.canPickup),
        },
        include: { guardian: true, relationType: true },
      });
    });
    if (guardianCreated) await recordAuditEvent(prisma, { institutionId, actorUserId: req.user?.uid, action: 'GUARDIAN_CREATED', entityType: 'Guardian', entityId: link.guardianId });
    await recordAuditEvent(prisma, { institutionId, actorUserId: req.user?.uid, action: 'STUDENT_GUARDIAN_LINKED', entityType: 'StudentGuardian', entityId: link.id, metadata: { studentId, guardianId: link.guardianId } });
    return res.status(201).json(link);
  } catch (error: any) {
    if (error?.message === 'INVALID_RELATION_TYPE') return res.status(400).json({ error: 'Invalid or inactive relation type.' });
    if (error?.code === 'P2002') return res.status(409).json({ error: 'This guardian is already linked to the student' });
    throw error;
  }
}

export async function updateStudentGuardian(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const linkId = req.params['id'] as string;
  const input = req.body;
  const existing = await prisma.studentGuardian.findFirst({ where: { id: linkId, institutionId }, include: { guardian: true } });
  if (!existing) return res.status(404).json({ error: 'Guardian relation not found' });
  if (!await ensureActiveStudentInInstitution(institutionId, existing.studentId)) return res.status(404).json({ error: 'Student is archived or inactive.' });
  try {
    const link = await prisma.$transaction(async (tx) => {
      if (input.isPrimaryContact === true) await tx.studentGuardian.updateMany({ where: { institutionId, studentId: existing.studentId, isPrimaryContact: true, id: { not: linkId } }, data: { isPrimaryContact: false } });
      if (Object.keys(guardianDataFromInput(input)).some((key) => input[key] !== undefined)) await tx.guardian.update({ where: { id: existing.guardianId }, data: guardianDataFromInput({ ...existing.guardian, ...input }) });
      return tx.studentGuardian.update({ where: { id: linkId }, data: {
        ...(input.relationTypeId !== undefined ? { relationTypeId: await resolveStrictRelationTypeId(tx, input.relationTypeId) } : {}),
        ...(input.isPrimaryContact !== undefined ? { isPrimaryContact: Boolean(input.isPrimaryContact) } : {}),
        ...(input.isFinancialResponsible !== undefined ? { isFinancialResponsible: Boolean(input.isFinancialResponsible) } : {}),
        ...(input.hasCustody !== undefined ? { hasCustody: Boolean(input.hasCustody) } : {}),
        ...(input.canPickup !== undefined ? { canPickup: Boolean(input.canPickup) } : {}),
      }, include: { guardian: true, relationType: true } });
    });
    await recordAuditEvent(prisma, { institutionId, actorUserId: req.user?.uid, action: 'GUARDIAN_UPDATED', entityType: 'StudentGuardian', entityId: link.id, metadata: { studentId: existing.studentId, guardianId: existing.guardianId } });
    return res.json(link);
  } catch (error: any) {
    if (error?.message === 'INVALID_RELATION_TYPE') return res.status(400).json({ error: 'Invalid or inactive relation type.' });
    if (error?.code === 'P2002') return res.status(409).json({ error: 'This guardian is already linked to the student' });
    throw error;
  }
}

export async function deleteStudentGuardian(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const linkId = req.params['linkId'] as string;
  const link = await prisma.studentGuardian.findFirst({ where: { id: linkId, institutionId } });
  if (!link) return res.status(404).json({ error: 'Guardian relation not found' });
  if (!await ensureActiveStudentInInstitution(institutionId, link.studentId)) return res.status(404).json({ error: 'Student is archived or inactive.' });
  await prisma.studentGuardian.delete({ where: { id: linkId } });
  await recordAuditEvent(prisma, { institutionId, actorUserId: req.user?.uid, action: 'STUDENT_GUARDIAN_UNLINKED', entityType: 'StudentGuardian', entityId: linkId, metadata: { studentId: link.studentId, guardianId: link.guardianId } });
  return res.json({ success: true });
}

export async function getStudentMedicalProfile(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const studentId = req.params['id'] as string;
  if (!await ensureStudentInInstitution(institutionId, studentId)) return res.status(404).json({ error: 'Student not found' });
  const profile = await prisma.studentMedicalProfile.findUnique({ where: { institutionId_studentId: { institutionId, studentId } } });
  return res.json(profile);
}

export async function upsertStudentMedicalProfile(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const studentId = req.params['id'] as string;
  if (!await ensureActiveStudentInInstitution(institutionId, studentId)) return res.status(404).json({ error: 'Student is archived or inactive.' });
  const input = req.body;
  const data: Record<string, unknown> = {};
  for (const field of ['bloodType', 'allergiesDescription', 'chronicConditions', 'emergencyInstructions', 'specialNeedsNotes']) {
    if (Object.prototype.hasOwnProperty.call(input, field)) data[field] = input[field]?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'hasSpecialNeeds')) data.hasSpecialNeeds = Boolean(input.hasSpecialNeeds);
  const profile = await prisma.studentMedicalProfile.upsert({
    where: { institutionId_studentId: { institutionId, studentId } },
    create: { institutionId, studentId, bloodType: null, allergiesDescription: null, chronicConditions: null, emergencyInstructions: null, hasSpecialNeeds: false, specialNeedsNotes: null, ...data },
    update: data,
  });
  await recordAuditEvent(prisma, { institutionId, actorUserId: req.user?.uid, action: 'STUDENT_MEDICAL_UPDATED', entityType: 'StudentMedicalProfile', entityId: profile.id, metadata: { studentId, fields: Object.keys(data) } });
  return res.json(profile);
}

export async function deleteStudentMedicalProfile(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const studentId = req.params['id'] as string;
  const profile = await prisma.studentMedicalProfile.findUnique({ where: { institutionId_studentId: { institutionId, studentId } } });
  if (!profile) return res.status(404).json({ error: 'Medical profile not found' });
  if (!await ensureActiveStudentInInstitution(institutionId, studentId)) return res.status(404).json({ error: 'Student is archived or inactive.' });
  await prisma.studentMedicalProfile.delete({ where: { id: profile.id } });
  return res.json({ success: true });
}

export async function createStudents(req: ContextRequest, res: Response): Promise<any> {
  const instId = req.context!.institutionId;
  const acadYearId = req.context!.academicYearId;

  const {
    nationalId,
    firstNameAr,
    lastNameAr,
    firstNameHe,
    lastNameHe,
    genderId,
    studentStatusId,
    birthDate,
    photoUrl,
    email,
    phoneNumber,
    addressAr,
    addressHe,
    townId,
    notes,
    studentFeatureId,
    isActive,
    classId,
    academicYearId,
    medicalProfile,
    guardian,
    relationTypeId,
  } = req.body;

  const normalizedNationalId = typeof nationalId === 'string' ? nationalId.trim() : nationalId;

  const student = await prisma.$transaction(async (tx) => {
    let enrollmentAcademicYearId = acadYearId;
    let classRecord: { academicYearId: string } | null = null;
    if (academicYearId) {
      if (academicYearId !== acadYearId) throw new Error('The requested academic year must match the current school context');
      const requestedAcademicYear = await tx.academicYear.findFirst({
        where: { id: academicYearId, institutionId: instId },
        select: { id: true },
      });
      if (!requestedAcademicYear) throw new Error('Academic year does not belong to the current institution');
      enrollmentAcademicYearId = requestedAcademicYear.id;
    }

    if (classId) {
      classRecord = await tx.class.findFirst({
        where: { id: classId, institutionId: instId, academicYearId: enrollmentAcademicYearId },
        select: { academicYearId: true },
      });
      if (!classRecord) throw new Error('Class does not belong to the current institution');
      if (academicYearId && academicYearId !== classRecord.academicYearId) {
        throw new Error('The selected class does not belong to the requested academic year');
      }
      enrollmentAcademicYearId = classRecord.academicYearId;
    }

    const resolvedStudentStatusId = await resolveStudentStatusId(tx, studentStatusId);
    const resolvedGenderId = await resolveGenderId(tx, genderId);
    const created = await tx.student.create({
      data: {
        institutionId: instId,
        nationalId: normalizedNationalId,
        firstNameAr,
        lastNameAr,
        firstNameHe: firstNameHe || null,
        lastNameHe: lastNameHe || null,
        genderId: resolvedGenderId,
        studentStatusId: resolvedStudentStatusId,
        birthDate: birthDate ? new Date(birthDate) : null,
        photoUrl: photoUrl || null,
        email: email || null,
        phoneNumber: phoneNumber || null,
        addressAr: addressAr || null,
        addressHe: addressHe || null,
        townId: townId || null,
        notes: notes || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });
    if (medicalProfile) {
      await tx.studentMedicalProfile.create({
        data: {
          institutionId: instId,
          studentId: created.id,
          bloodType: medicalProfile.bloodType || null,
          allergiesDescription: medicalProfile.allergiesDescription || null,
          chronicConditions: medicalProfile.chronicConditions || null,
          emergencyInstructions: medicalProfile.emergencyInstructions || null,
          hasSpecialNeeds: medicalProfile.hasSpecialNeeds !== undefined ? Boolean(medicalProfile.hasSpecialNeeds) : false,
          specialNeedsNotes: medicalProfile.specialNeedsNotes || null,
        },
      });
    }
    if (guardian) {
      const createdGuardian = await tx.guardian.create({
        data: {
          institutionId: instId,
          firstNameAr: guardian.firstNameAr || '',
          lastNameAr: guardian.lastNameAr || '',
          firstNameHe: guardian.firstNameHe || null,
          lastNameHe: guardian.lastNameHe || null,
          primaryPhoneNumber: guardian.primaryPhoneNumber || '',
          secondaryPhoneNumber: guardian.secondaryPhoneNumber || null,
          email: guardian.email || null,
          addressAr: guardian.addressAr || null,
          addressHe: guardian.addressHe || null,
          isActive: true,
        },
      });
      await tx.studentGuardian.create({
        data: {
          institutionId: instId,
          studentId: created.id,
          guardianId: createdGuardian.id,
          relationTypeId: await resolveRelationTypeId(tx, relationTypeId),
          isPrimaryContact: true,
          isFinancialResponsible: true,
          hasCustody: true,
          canPickup: true,
        },
      });
    }
    if (classId) {
      await tx.studentEnrollment.create({
        data: {
          institutionId: instId,
          academicYearId: enrollmentAcademicYearId,
          studentId: created.id,
          classId,
          enrollmentStatusId: await resolveEnrollmentStatusId(tx),
          enrollmentNumber: `ENR-${Date.now().toString().slice(-4)}`,
          startDate: new Date(),
          isActive: true,
        },
      });
    }
    return created;
  });

  return res.status(201).json(student);

}

export async function updateStudentsById(req: ContextRequest, res: Response): Promise<any> {
  const id = req.params['id'] as string;
  const instId = req.context!.institutionId;
  const acadYearId = req.context!.academicYearId;

  const {
    nationalId,
    firstNameAr,
    lastNameAr,
    firstNameHe,
    lastNameHe,
    genderId,
    studentStatusId,
    birthDate,
    photoUrl,
    email,
    phoneNumber,
    addressAr,
    addressHe,
    townId,
    notes,
    isActive,
    classId,
    medicalProfile,
    guardian,
    relationTypeId,
  } = req.body;

  const updated = await prisma.$transaction(async (tx) => {
    const existingStudent = await tx.student.findFirst({ where: { id, institutionId: instId } });
    if (!existingStudent) return null;
    const resolvedStudentStatusId = await resolveStudentStatusId(tx, studentStatusId || existingStudent.studentStatusId);
    const resolvedGenderId = await resolveGenderId(tx, genderId || existingStudent.genderId);
    const updatedStudent = await tx.student.update({
      where: { id: existingStudent.id },
      data: {
        ...(nationalId !== undefined ? { nationalId: String(nationalId).trim() } : {}),
        ...(firstNameAr !== undefined ? { firstNameAr } : {}),
        ...(lastNameAr !== undefined ? { lastNameAr } : {}),
        ...(firstNameHe !== undefined ? { firstNameHe: firstNameHe || null } : {}),
        ...(lastNameHe !== undefined ? { lastNameHe: lastNameHe || null } : {}),
        ...(genderId !== undefined ? { genderId: resolvedGenderId } : {}),
        ...(studentStatusId !== undefined ? { studentStatusId: resolvedStudentStatusId } : {}),
        ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(birthDate) : null } : {}),
        ...(photoUrl !== undefined ? { photoUrl: photoUrl || null } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber: phoneNumber || null } : {}),
        ...(addressAr !== undefined ? { addressAr: addressAr || null } : {}),
        ...(addressHe !== undefined ? { addressHe: addressHe || null } : {}),
        ...(townId !== undefined ? { townId: townId || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        updatedAt: new Date(),
      },
    });
    if (medicalProfile) {
      const profile = {
        bloodType: medicalProfile.bloodType || null,
        allergiesDescription: medicalProfile.allergiesDescription || null,
        chronicConditions: medicalProfile.chronicConditions || null,
        emergencyInstructions: medicalProfile.emergencyInstructions || null,
        hasSpecialNeeds: medicalProfile.hasSpecialNeeds !== undefined ? Boolean(medicalProfile.hasSpecialNeeds) : false,
        specialNeedsNotes: medicalProfile.specialNeedsNotes || null,
      };
      const existingProfile = await tx.studentMedicalProfile.findUnique({ where: { institutionId_studentId: { institutionId: instId, studentId: id } } });
      if (existingProfile) await tx.studentMedicalProfile.update({ where: { id: existingProfile.id }, data: profile });
      else await tx.studentMedicalProfile.create({ data: { institutionId: instId, studentId: id, ...profile } });
    }
    if (guardian) {
      const existingLink = await tx.studentGuardian.findFirst({ where: { studentId: id, isPrimaryContact: true, institutionId: instId } });
      const guardianData = {
        firstNameAr: guardian.firstNameAr || '',
        lastNameAr: guardian.lastNameAr || '',
        firstNameHe: guardian.firstNameHe || null,
        lastNameHe: guardian.lastNameHe || null,
        primaryPhoneNumber: guardian.primaryPhoneNumber || '',
        secondaryPhoneNumber: guardian.secondaryPhoneNumber || null,
        email: guardian.email || null,
        addressAr: guardian.addressAr || null,
        addressHe: guardian.addressHe || null,
        updatedAt: new Date(),
      };
      if (existingLink) {
        await tx.guardian.update({ where: { id: existingLink.guardianId }, data: guardianData });
        await tx.studentGuardian.update({ where: { id: existingLink.id }, data: { relationTypeId: await resolveRelationTypeId(tx, relationTypeId), updatedAt: new Date() } });
      } else {
        const createdGuardian = await tx.guardian.create({ data: { institutionId: instId, ...guardianData, isActive: true } });
        await tx.studentGuardian.create({
          data: { institutionId: instId, studentId: id, guardianId: createdGuardian.id, relationTypeId: await resolveRelationTypeId(tx, relationTypeId), isPrimaryContact: true, isFinancialResponsible: true, hasCustody: true, canPickup: true },
        });
      }
    }
    if (classId) {
      const classRecord = await tx.class.findFirst({ where: { id: classId, institutionId: instId, academicYearId: acadYearId } });
      if (!classRecord) throw new Error('Class does not belong to the current institution');
      const existingEnrollment = await tx.studentEnrollment.findFirst({ where: { studentId: id, institutionId: instId, academicYearId: acadYearId } });
      if (existingEnrollment) {
        await tx.studentEnrollment.update({ where: { id: existingEnrollment.id }, data: { classId, updatedAt: new Date() } });
      } else {
        await tx.studentEnrollment.create({
          data: { institutionId: instId, academicYearId: acadYearId, studentId: id, classId, enrollmentStatusId: await resolveEnrollmentStatusId(tx), enrollmentNumber: `ENR-${Date.now().toString().slice(-4)}`, startDate: new Date(), isActive: true },
        });
      }
    }
    const changedFields = ['nationalId', 'firstNameAr', 'lastNameAr', 'firstNameHe', 'lastNameHe', 'genderId', 'studentStatusId', 'birthDate', 'photoUrl', 'email', 'phoneNumber', 'addressAr', 'addressHe', 'townId', 'notes', 'isActive', 'classId'].filter((field) => req.body[field] !== undefined);
    await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'UPDATE', entityType: 'Student', entityId: id, metadata: { changedFields } });
    return updatedStudent;
  });
  if (!updated) return res.status(404).json({ error: 'Student not found or unauthorized' });
  return res.json(updated);

}

export async function deleteStudentsById(req: ContextRequest, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const instId = req.context!.institutionId;

  const existing = await prisma.student.findFirst({ where: { id, institutionId: instId } });
  if (!existing) {
    return res.status(404).json({ error: 'Student not found or unauthorized' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: existing.id }, data: { isActive: false, updatedAt: new Date() } });
    await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'ARCHIVE', entityType: 'Student', entityId: existing.id, metadata: { reason: 'student_archive' } });
  });

  return res.json({ success: true, archived: true, id });

}

export async function restoreStudentsById(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const existing = await prisma.student.findFirst({ where: { id: String(req.params.id), institutionId, isActive: false } });
  if (!existing) return res.status(404).json({ error: 'الطالب المؤرشف غير موجود.' });
  const restored = await prisma.$transaction(async (tx) => {
    const result = await tx.student.update({ where: { id: existing.id }, data: { isActive: true, updatedAt: new Date() } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'RESTORE', entityType: 'Student', entityId: existing.id });
    return result;
  });
  return res.json({ success: true, student: restored });
}


export async function getStudentsByIdGrades(req: ContextRequest, res: Response): Promise<any> {
  
  const studentId = req.params['id'] as string;
  const instId = req.context!.institutionId;

  const results = await prisma.studentExamResult.findMany({
    where: { studentId, institutionId: instId },
  });
  const examIds = [...new Set(results.map((result) => result.examId))];
  const exams = examIds.length > 0 ? await prisma.exam.findMany({ where: { id: { in: examIds }, institutionId: instId } }) : [];
  const subjectIds = [...new Set(exams.map((exam) => exam.subjectId))];
  const subjects = subjectIds.length > 0 ? await prisma.subject.findMany({ where: { id: { in: subjectIds }, institutionId: instId }, select: { id: true, nameAr: true } }) : [];
  const examMap = new Map(exams.map((exam) => [exam.id, exam]));
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject.nameAr]));
  const grades = results.map((result) => {
    const exam = examMap.get(result.examId);
    return {
      id: result.id,
      examId: result.examId,
      examTitle: exam?.titleAr,
      maxScore: exam?.maxScore,
      score: result.totalScore,
      isAbsent: result.isAbsence,
      notes: result.notes,
      subjectName: exam ? subjectMap.get(exam.subjectId) ?? null : null,
      date: exam?.examDate,
    };
  });

  return res.json(grades);

}

export async function getStudentsByIdAttendance(req: ContextRequest, res: Response): Promise<any> {
  const studentId = req.params['id'] as string;
  const institutionId = req.context!.institutionId;
  const academicYearId = req.context!.academicYearId;
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId }, select: { id: true } });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { institutionId, studentId, academicYearId, isDeleted: false, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!enrollment) return res.json([]);
  const rows = await prisma.attendance.findMany({
    where: { institutionId, studentEnrollmentId: enrollment.id },
    orderBy: { attendanceDate: 'desc' },
  });
  return res.json(rows.map((row) => serializeAttendance(row, studentId)));
  /*
  const legacyStudentId = studentId;
  // Since there is no attendance table in the schema, we'll return mock attendance records for the student
  const statuses: ('present' | 'absent' | 'late' | 'excused')[] = ['present', 'present', 'present', 'present', 'late', 'present', 'absent', 'present', 'excused', 'present'];
  const mockAttendance = [];
  const today = new Date();
  for (let i = 0; i < 15; i++) {
    const date = new Date();
    date.setDate(today.getDate() - i);
    // Skip weekends (Friday and Saturday in Arab schools)
    const day = date.getDay();
    if (day === 5 || day === 6) continue; // Skip Friday/Saturday
    
    const status = statuses[(studentId.charCodeAt(0) + i) % statuses.length];
    mockAttendance.push({
      id: `att-mock-${studentId}-${i}`,
      studentId,
      date: date.toISOString().split('T')[0],
      status,
      notes: status === 'absent' ? '״÷״§״¨ …״¨״±״± ״¨״×‚״±״± ״·״¨' : status === 'late' ? '״×״£״®״± ״¹† ״§„״·״§״¨ˆ״± ״§„״µ״¨״§״­' : undefined
    });
  }

  return res.json(mockAttendance);
  */

}

function parseAttendanceDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Attendance date must be a valid YYYY-MM-DD date.');
  }
  return parsed;
}

async function resolveCurrentEnrollment(institutionId: string, academicYearId: string, studentId: string) {
  return prisma.studentEnrollment.findFirst({
    where: { institutionId, academicYearId, studentId, isDeleted: false, isActive: true, enrollmentStatus: { isActive: true, isFinalStatus: false }, student: { isActive: true } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
}

function serializeAttendance(row: any, studentId: string) {
  return {
    id: row.id,
    studentId,
    studentEnrollmentId: row.studentEnrollmentId,
    date: row.attendanceDate.toISOString().slice(0, 10),
    status: row.status.toLowerCase(),
    notes: row.notes,
  };
}

export async function createStudentAttendance(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const academicYearId = req.context!.academicYearId;
  const studentId = req.params['id'] as string;
  const input = req.body as AttendanceInput;
  const enrollment = await resolveCurrentEnrollment(institutionId, academicYearId, studentId);
  if (!enrollment) return res.status(404).json({ error: 'Active student enrollment not found' });
  try {
    const row = await prisma.attendance.create({
      data: {
        institutionId,
        studentEnrollmentId: enrollment.id,
        attendanceDate: parseAttendanceDate(input.attendanceDate),
        status: input.status as AttendanceStatus,
        notes: input.notes ?? null,
        createdBy: req.user?.uid ?? null,
      },
    });
    return res.status(201).json(serializeAttendance(row, studentId));
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Attendance already exists for this student and date' });
    throw error;
  }
}

export async function updateStudentAttendance(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const id = req.params['id'] as string;
  const input = req.body as AttendanceInput;
  const existing = await prisma.attendance.findFirst({
    where: { id, institutionId, studentEnrollment: { academicYearId: req.context!.academicYearId, isDeleted: false, isActive: true, enrollmentStatus: { isActive: true, isFinalStatus: false }, student: { isActive: true } } },
    include: { studentEnrollment: { select: { studentId: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Attendance record not found' });
  try {
    const row = await prisma.attendance.update({
      where: { id },
      data: {
        attendanceDate: parseAttendanceDate(input.attendanceDate),
        status: input.status as AttendanceStatus,
        notes: input.notes ?? null,
        updatedBy: req.user?.uid ?? null,
      },
    });
    return res.json(serializeAttendance(row, existing.studentEnrollment.studentId));
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Attendance already exists for this student and date' });
    throw error;
  }
}

export async function deleteStudentAttendance(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context!.institutionId;
  const id = req.params['id'] as string;
  const existing = await prisma.attendance.findFirst({ where: { id, institutionId, studentEnrollment: { academicYearId: req.context!.academicYearId, isDeleted: false, isActive: true, enrollmentStatus: { isActive: true, isFinalStatus: false }, student: { isActive: true } } }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: 'Attendance record not found' });
  await prisma.attendance.delete({ where: { id } });
  return res.json({ success: true });
}


// Student Enrollments CRUD
export async function getStudentEnrollments(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context!.institutionId;
  const acadYearId = req.context!.academicYearId;
  
  const enrollmentRows = await prisma.studentEnrollment.findMany({
    where: { institutionId: instId, academicYearId: acadYearId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    include: { studentFeature: true },
  });
  const studentIds = [...new Set(enrollmentRows.map((row) => row.studentId))];
  const classIds = [...new Set(enrollmentRows.map((row) => row.classId))];
  const [students, classes] = await Promise.all([
    prisma.student.findMany({ where: { institutionId: instId, id: { in: studentIds } }, include: { gender: true, town: true } }),
    prisma.class.findMany({ where: { institutionId: instId, id: { in: classIds } }, include: { gradeLevel: true } }),
  ]);
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const classesById = new Map(classes.map((item) => [item.id, item]));
  const enrollments = enrollmentRows.map((enrollment) => ({
    enrollment,
    student: studentsById.get(enrollment.studentId) || null,
    classRoom: classesById.get(enrollment.classId) || null,
  }));

  return res.json(enrollments);

}

export async function createStudentEnrollments(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context!.institutionId;
  const acadYearId = req.context!.academicYearId;
  
  const {
    studentId,
    classRoomId,
    startDate,
    notes,
    studentFeatureId,
  } = req.body;

  if (!studentId || !classRoomId) {
    return res.status(400).json({ error: '״§„״±״¬״§״¡ ״§״®״×״§״± ״§„״·״§„״¨ ˆ״§„״´״¹״¨״©' });
  }

  // Check if the student is already enrolled in this academic year
  const [student, classRoom, existing] = await Promise.all([
    prisma.student.findFirst({ where: { id: studentId, institutionId: instId } }),
    prisma.class.findFirst({ where: { id: classRoomId, institutionId: instId, academicYearId: acadYearId } }),
    prisma.studentEnrollment.findFirst({
      where: { studentId, institutionId: instId, academicYearId: acadYearId },
    }),
  ]);

  if (!student || !classRoom) {
    return res.status(400).json({ error: 'Student and class must belong to the current institution' });
  }
  if (existing && !existing.isDeleted) {
    return res.status(400).json({ error: '״¹״°״±״§‹״ ‡״°״§ ״§„״·״§„״¨ …״³״¬„ ״¨״§„״¹„  ״´״¹״¨״© ״£״®״±‰ „‡״°‡ ״§„״³†״© ״§„״¯״±״§״³״© ˆ„״§ …ƒ† ״×״³״¬„‡  ״£ƒ״«״± …† ״´״¹״¨״©.' });
  }

  const defaultEnrollmentStatus = await prisma.enrollmentStatus.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  if (!defaultEnrollmentStatus) return res.status(409).json({ error: '„״§ ˆ״¬״¯ ˆ״¶״¹ ״×״³״¬„ ״¹״§„  ״§„״¬״¯״§ˆ„ ״§„…״³״§״¹״¯״©.' });

  if (existing?.isDeleted) {
    const restored = await prisma.$transaction(async (tx) => {
      await tx.studyGroupStudent.deleteMany({ where: { studentEnrollmentId: existing.id } });
      return tx.studentEnrollment.update({
        where: { id: existing.id },
        data: {
          classId: classRoomId,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: null,
          isActive: true,
          isDeleted: false,
          deletedAt: null,
          deletedByUserId: null,
          notes: notes || null,
          studentFeatureId: studentFeatureId || null,
          enrollmentStatusId: defaultEnrollmentStatus.id,
          updatedAt: new Date(),
        },
      });
    });
    return res.status(200).json(restored);
  }

  const inserted = await prisma.studentEnrollment.create({
    data: {
      institutionId: instId,
      academicYearId: acadYearId,
      studentId,
      classId: classRoomId,
      enrollmentStatusId: defaultEnrollmentStatus.id,
      enrollmentNumber: `ENR-${Date.now().toString().slice(-5)}`,
      startDate: startDate ? new Date(startDate) : new Date(),
      isActive: true,
      notes: notes || null,
      studentFeatureId: studentFeatureId || null,
    },
  });

  return res.status(201).json(inserted);

}

export async function updateStudentEnrollmentsById(req: ContextRequest, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const instId = req.context!.institutionId;
  const {
    classRoomId,
    startDate,
    endDate,
    isActive,
    notes,
    studentFeatureId,
  } = req.body;

  const existing = await prisma.studentEnrollment.findFirst({ where: { id, institutionId: instId, academicYearId: req.context!.academicYearId } });
  if (!existing) {
    return res.status(404).json({ error: 'Enrollment record not found or unauthorized' });
  }
  if (classRoomId) {
    const classRoom = await prisma.class.findFirst({
      where: { id: classRoomId, institutionId: instId, academicYearId: existing.academicYearId },
      select: { id: true },
    });
    if (!classRoom) return res.status(400).json({ error: 'الشعبة المحددة لا تنتمي إلى السنة الدراسية الحالية.' });
  }
  const updated = await prisma.studentEnrollment.update({
    where: { id: existing.id },
    data: {
      ...(classRoomId !== undefined ? { classId: classRoomId } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : existing.startDate } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(studentFeatureId !== undefined ? { studentFeatureId: studentFeatureId || null } : {}),
      updatedAt: new Date(),
    },
  });

  return res.json(updated);

}

export async function deleteStudentEnrollmentsById(req: ContextRequest, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const institutionId = req.context!.institutionId;
  const existing = await prisma.studentEnrollment.findFirst({
    where: { id, institutionId, academicYearId: req.context!.academicYearId, isDeleted: false },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Enrollment record not found or unauthorized' });
  }
  await prisma.studentEnrollment.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  return res.json({ success: true, id });

}
