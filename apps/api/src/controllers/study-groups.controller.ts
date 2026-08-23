import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';

const uuid = (value: unknown): string | null => {
  const text = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
};

const context = (req: ContextRequest) => ({
  institutionId: req.context?.institutionId || '',
  academicYearId: req.context?.academicYearId || '',
});

async function resolveRelations(req: ContextRequest, body: any) {
  const { institutionId, academicYearId } = context(req);
  const subjectId = uuid(body.subjectId);
  const classId = body.classId ? uuid(body.classId) : null;
  const staffAssignmentId = body.staffAssignmentId ? uuid(body.staffAssignmentId) : null;
  if (!subjectId) return null;

  const [subject, classRoom, assignment] = await Promise.all([
    prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId, archivedAt: null, isActive: true } }),
    classId ? prisma.class.findFirst({ where: { id: classId, institutionId, academicYearId, archivedAt: null } }) : null,
    staffAssignmentId ? prisma.staffAssignment.findFirst({ where: { id: staffAssignmentId, institutionId, academicYearId, archivedAt: null, isActive: true } }) : null,
  ]);
  return { subject, classRoom, assignment };
}

export async function getStudyGroups(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  if (!institutionId || !academicYearId) return res.status(400).json({ error: 'سياق المؤسسة والسنة الدراسية مطلوب.' });
  const includeArchived = String(req.query.includeArchived || '') === 'true';
  const groups = await prisma.studyGroup.findMany({
    where: { institutionId, academicYearId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: {
      subject: { select: { id: true, nameAr: true, nameHe: true } },
      classRoom: { select: { id: true, nameAr: true, gradeLevelId: true, gradeLevel: { select: { id: true, nameAr: true } } } },
      staffAssignment: { include: { staffMember: { select: { firstNameAr: true, familyNameAr: true } } } },
      _count: { select: { students: true, examGroups: true } },
    },
    orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
  });
  return res.json(groups);
}

export async function createStudyGroups(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const { nameAr, nameHe, classId, subjectId, staffAssignmentId, isActive } = req.body || {};
  if (!institutionId || !academicYearId || !String(nameAr || '').trim()) return res.status(400).json({ error: 'اسم المجموعة مطلوب.' });
  if (!institutionId && !academicYearId) {
    return res.status(400).json({ error: 'لا يمكن إضافة طالب من صف مختلف عن صف المجموعة.' });
  }
  try {
    const relations = await resolveRelations(req, req.body || {});
    if (!relations?.subject) return res.status(400).json({ error: 'المادة المختارة غير صالحة أو لا تنتمي للسياق الحالي.' });
    if (classId && !relations.classRoom) return res.status(400).json({ error: 'الصف المختار غير صالح أو لا ينتمي للسياق الحالي.' });
    if (staffAssignmentId && !relations.assignment) return res.status(400).json({ error: 'تكليف المعلم المختار غير صالح أو لا ينتمي للسياق الحالي.' });
    const inserted = await prisma.studyGroup.create({ data: { institutionId, academicYearId, classId: relations.classRoom?.id || null, subjectId: relations.subject.id, staffAssignmentId: relations.assignment?.id || null, nameAr: String(nameAr).trim(), nameHe: String(nameHe || '').trim() || null, isActive: isActive !== false, createdBy: uuid(req.user?.uid) } });
    return res.status(201).json(inserted);
  } catch (error: any) {
    if (error?.code === 'P2003') return res.status(400).json({ error: 'تعذر ربط المجموعة بأحد السجلات المرجعية. أعد تحميل الصفحة واختر المادة والصف والمعلم من القوائم الحالية.' });
    if (error?.code === 'P2023') return res.status(400).json({ error: 'سياق المؤسسة أو السنة الدراسية غير صالح. أعد تحميل الصفحة وسجّل الدخول مجددًا.' });
    if (error?.code === 'P2010') return res.status(400).json({ error: 'تعذر قراءة بيانات المؤسسة الحالية. أعد تحميل الصفحة ثم حاول مرة أخرى.' });
    if (error?.code === 'P2002') return res.status(409).json({ error: 'توجد مجموعة تعلم بالبيانات نفسها.' });
    console.error('[POST /api/study-groups] Failed to create study group:', error);
    return res.status(400).json({ error: 'تعذر إنشاء مجموعة التعلم بسبب بيانات غير متوافقة. أعد تحميل القوائم واختر المادة والصف والمعلم من جديد.' });
  }
}

export async function updateStudyGroupsById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params.id);
  const { institutionId, academicYearId } = context(req);
  const existing = await prisma.studyGroup.findFirst({ where: { id, institutionId, academicYearId, archivedAt: null } });
  if (!existing) return res.status(404).json({ error: 'مجموعة التعلم غير موجودة أو غير مصرح بها.' });
  const { nameAr, nameHe, classId, subjectId, staffAssignmentId, isActive } = req.body || {};
  if (!String(nameAr || '').trim()) return res.status(400).json({ error: 'اسم المجموعة مطلوب.' });
  const relations = await resolveRelations(req, req.body || {});
  if (!relations?.subject) return res.status(400).json({ error: 'المادة المختارة غير صالحة أو لا تنتمي للسياق الحالي.' });
  if (classId && !relations.classRoom) return res.status(400).json({ error: 'الصف المختار غير صالح أو لا ينتمي للسياق الحالي.' });
  if (staffAssignmentId && !relations.assignment) return res.status(400).json({ error: 'تكليف المعلم المختار غير صالح أو لا ينتمي للسياق الحالي.' });
  const updated = await prisma.studyGroup.update({ where: { id }, data: { nameAr: String(nameAr).trim(), nameHe: String(nameHe || '').trim() || null, classId: relations.classRoom?.id || null, subjectId: relations.subject.id, staffAssignmentId: relations.assignment?.id || null, isActive: isActive !== false, updatedBy: uuid(req.user?.uid), updatedAt: new Date() } });
  return res.json(updated);
}

export async function deleteStudyGroupsById(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const existing = await prisma.studyGroup.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null } });
  if (!existing) return res.status(404).json({ error: 'مجموعة التعلم غير موجودة أو غير مصرح بها.' });
  await prisma.$transaction(async (tx) => {
    await tx.studyGroup.update({ where: { id: existing.id }, data: { archivedAt: new Date(), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'ARCHIVE', entityType: 'StudyGroup', entityId: existing.id });
  });
  return res.json({ success: true, archived: true });
}

export async function restoreStudyGroupsById(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const existing = await prisma.studyGroup.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: { not: null } } });
  if (!existing) return res.status(404).json({ error: 'مجموعة التعلم المؤرشفة غير موجودة أو غير مصرح بها.' });
  const restored = await prisma.$transaction(async (tx) => {
    const result = await tx.studyGroup.update({ where: { id: existing.id }, data: { archivedAt: null, updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'RESTORE', entityType: 'StudyGroup', entityId: existing.id });
    return result;
  });
  return res.json({ success: true, studyGroup: restored });
}

export async function getStudyGroupsByIdMembers(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const group = await prisma.studyGroup.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null } });
  if (!group) return res.status(404).json({ error: 'مجموعة التعلم غير موجودة.' });
  const memberships = await prisma.studyGroupStudent.findMany({
    where: {
      studyGroupId: group.id,
      institutionId,
      studentEnrollment: {
        isActive: true,
        isDeleted: false,
        ...(group.classId ? { classId: group.classId } : {}),
      },
    },
    include: { studentEnrollment: { include: { student: { select: { id: true, firstNameAr: true, lastNameAr: true, nationalId: true } }, classRoom: { select: { id: true, nameAr: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return res.json(memberships.map(item => ({ id: item.id, enrollmentId: item.studentEnrollmentId, studentId: item.studentEnrollment.studentId, firstNameAr: item.studentEnrollment.student.firstNameAr, lastNameAr: item.studentEnrollment.student.lastNameAr, nationalId: item.studentEnrollment.student.nationalId, classRoom: item.studentEnrollment.classRoom }))); 
}

export async function createStudyGroupsByIdMembers(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const groupId = String(req.params.id);
  const enrollmentId = uuid(req.body?.enrollmentId || req.body?.studentEnrollmentId);
  if (!enrollmentId) return res.status(400).json({ error: 'معرّف تسجيل الطالب مطلوب.' });
  const [group, enrollment] = await Promise.all([
    prisma.studyGroup.findFirst({ where: { id: groupId, institutionId, academicYearId, archivedAt: null } }),
    prisma.studentEnrollment.findFirst({ where: { id: enrollmentId, institutionId, academicYearId, isDeleted: false, isActive: true } }),
  ]);
  if (!group) return res.status(404).json({ error: 'مجموعة التعلم غير موجودة.' });
  if (!enrollment) return res.status(404).json({ error: 'تسجيل الطالب غير موجود أو غير نشط.' });
  try {
    if (group.classId && enrollment.classId !== group.classId) {
      return res.status(400).json({ error: 'لا يمكن إضافة طالب من صف مختلف عن صف المجموعة.' });
    }
    const inserted = await prisma.studyGroupStudent.create({ data: { institutionId, studyGroupId: groupId, studentEnrollmentId: enrollmentId } });
    return res.status(201).json(inserted);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'الطالب منضم بالفعل إلى هذه المجموعة.' });
    throw error;
  }
}

export async function deleteStudyGroupsByIdMembersByMemberId(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = context(req);
  const group = await prisma.studyGroup.findFirst({ where: { id: String(req.params.id), institutionId, academicYearId, archivedAt: null }, select: { id: true } });
  if (!group) return res.status(404).json({ error: 'عضوية المجموعة غير متاحة في السياق الحالي.' });
  const existing = await prisma.studyGroupStudent.findFirst({ where: { id: String(req.params.memberId), institutionId, studyGroupId: group.id } });
  if (!existing) return res.status(404).json({ error: 'عضوية الطالب غير موجودة.' });
  await prisma.studyGroupStudent.delete({ where: { id: existing.id } });
  return res.json({ success: true });
}
