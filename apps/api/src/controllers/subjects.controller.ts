import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';

type RequestLike = { headers: Record<string, string | string[] | undefined>; context?: { institutionId?: string; academicYearId?: string } };
const institutionIdFrom = (req: RequestLike) => req.context?.institutionId || '';
const academicYearIdFrom = (req: RequestLike) => req.context?.academicYearId || '';
const nullableDate = (value: unknown) => value ? new Date(String(value)) : null;
const uuid = (value: unknown): string | null => {
  const text = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
};

const subjectName = (value: unknown) => String(value || '').trim();

async function validAcademicYear(institutionId: string, academicYearId: string) {
  return uuid(institutionId) && uuid(academicYearId)
    ? prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null } })
    : null;
}

async function validGradeLevel(gradeLevelId: string) {
  return uuid(gradeLevelId) ? prisma.gradeLevel.findFirst({ where: { id: gradeLevelId, isActive: true } }) : null;
}

async function topicResponse(institutionId: string, academicYearId: string) {
  return prisma.topic.findMany({
    where: { institutionId, ...(academicYearId ? { academicYearId } : {}) },
    include: { subject: { select: { nameAr: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function skillResponse(institutionId: string, academicYearId: string) {
  return prisma.skill.findMany({
    where: { institutionId, ...(academicYearId ? { academicYearId } : {}) },
    include: { subject: { select: { nameAr: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSubjects(req: ContextRequest, res: Response) {
  const institutionId = institutionIdFrom(req);
  const academicYearId = String(req.query.academicYearId || academicYearIdFrom(req));
  if (!uuid(institutionId) || !uuid(academicYearId)) return res.status(400).json({ error: 'السنة الدراسية مطلوبة.' });
  if (!(await validAcademicYear(institutionId, academicYearId))) return res.status(404).json({ error: 'السنة الدراسية غير متاحة للمؤسسة الحالية.' });
  const subjects = await prisma.subject.findMany({
    where: { institutionId, academicYearId },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(subjects);
}

export async function createSubjects(req: AuthRequest, res: Response) {
  const institutionId = institutionIdFrom(req);
  const { nameHe, isActive, archivedAt } = req.body;
  const nameAr = subjectName(req.body?.nameAr);
  const resolvedAcademicYearId = req.context?.academicYearId || '';
  if (!uuid(institutionId) || !nameAr || !resolvedAcademicYearId) return res.status(400).json({ error: 'السنة والاسم العربي للمادة مطلوبان.' });
  if (!(await validAcademicYear(institutionId, resolvedAcademicYearId))) return res.status(400).json({ error: 'السنة الدراسية غير صالحة للمؤسسة الحالية.' });
  const duplicate = await prisma.subject.findFirst({ where: { institutionId, academicYearId: resolvedAcademicYearId, nameAr, archivedAt: null }, select: { id: true } });
  if (duplicate) return res.status(409).json({ error: 'اسم المادة مستخدم مسبقًا في السنة الدراسية الحالية.' });
  try {
    const inserted = await prisma.subject.create({ data: { institutionId, academicYearId: resolvedAcademicYearId, nameAr, nameHe: subjectName(nameHe) || null, isActive: isActive !== undefined ? Boolean(isActive) : true, archivedAt: nullableDate(archivedAt), createdBy: uuid(req.user?.uid) } });
    return res.status(201).json(inserted);
  } catch (error) {
    return res.status(500).json({ error: 'تعذر حفظ المادة الدراسية.' });
  }
}

export async function updateSubjectsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const institutionId = institutionIdFrom(req);
  const academicYearId = academicYearIdFrom(req);
  const existing = await prisma.subject.findFirst({ where: { id, institutionId, ...(academicYearId ? { academicYearId } : {}) } });
  if (!existing) return res.status(404).json({ error: 'Subject not found' });
  const { nameHe, isActive, archivedAt } = req.body;
  const nameAr = subjectName(req.body?.nameAr);
  if (!nameAr || !(await validAcademicYear(institutionId, existing.academicYearId))) return res.status(400).json({ error: 'بيانات المادة أو السنة غير صالحة.' });
  const duplicate = await prisma.subject.findFirst({ where: { institutionId, academicYearId: existing.academicYearId, nameAr, archivedAt: null, id: { not: id } }, select: { id: true } });
  if (duplicate) return res.status(409).json({ error: 'اسم المادة مستخدم مسبقًا في السنة الدراسية الحالية.' });
  const updated = await prisma.subject.update({ where: { id }, data: { nameAr, nameHe: subjectName(nameHe) || null, isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive, archivedAt: nullableDate(archivedAt), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
  return res.json(updated);
}

export async function deleteSubjectsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const existing = await prisma.subject.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'Subject not found' });
  const archived = await prisma.subject.update({ where: { id }, data: { isActive: false, archivedAt: new Date(), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
  return res.json({ message: 'Subject archived successfully', archived: true, id, subject: archived });
}

export async function getTopics(req: ContextRequest, res: Response) {
  return res.json(await topicResponse(institutionIdFrom(req), academicYearIdFrom(req)));
}

export async function createTopics(req: AuthRequest, res: Response) {
  const institutionId = institutionIdFrom(req);
  const { academicYearId, subjectId, gradeLevelId, nameAr, nameHe, isActive, archivedAt } = req.body;
  if (!academicYearId || !subjectId || !gradeLevelId || !nameAr) return res.status(400).json({ error: 'academicYearId, subjectId, gradeLevelId and nameAr are required' });
  const [subject, year, gradeLevel] = await Promise.all([prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId } }), validAcademicYear(institutionId, academicYearId), validGradeLevel(gradeLevelId)]);
  if (!subject || !year || !gradeLevel) return res.status(400).json({ error: 'المادة أو السنة أو الصف المحدد غير صالح للسياق الحالي.' });
  const inserted = await prisma.topic.create({
    data: { institutionId, academicYearId, subjectId, gradeLevelId, nameAr, nameHe: nameHe || null, isActive: isActive !== undefined ? Boolean(isActive) : true, archivedAt: nullableDate(archivedAt), createdBy: uuid(req.user?.uid) },
  });
  return res.status(201).json(inserted);
}

export async function updateTopicsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const institutionId = institutionIdFrom(req);
  const existing = await prisma.topic.findFirst({ where: { id, institutionId } });
  if (!existing) return res.status(404).json({ error: 'Topic not found' });
  const { academicYearId, subjectId, gradeLevelId, nameAr, nameHe, isActive, archivedAt } = req.body;
  const [subject, year] = await Promise.all([
    prisma.subject.findFirst({ where: { id: String(subjectId || existing.subjectId), institutionId } }),
    prisma.academicYear.findFirst({ where: { id: String(academicYearId || existing.academicYearId), institutionId } }),
  ]);
  if (!subject || !year) return res.status(400).json({ error: 'المادة أو السنة الدراسية لا تنتمي إلى المؤسسة الحالية.' });
  if (subject.academicYearId !== year.id) return res.status(400).json({ error: 'المادة والسنة الدراسية غير متوافقتين.' });
  const updated = await prisma.topic.update({ where: { id }, data: { academicYearId: year.id, subjectId: subject.id, gradeLevelId: gradeLevelId || existing.gradeLevelId, nameAr, nameHe: nameHe || null, isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive, archivedAt: nullableDate(archivedAt), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
  return res.json(updated);
}

export async function deleteTopicsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const existing = await prisma.topic.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'Topic not found' });
  await prisma.topic.delete({ where: { id } });
  return res.json({ message: 'Topic deleted successfully', id });
}

export async function getSkills(req: ContextRequest, res: Response) {
  return res.json(await skillResponse(institutionIdFrom(req), academicYearIdFrom(req)));
}

export async function createSkills(req: AuthRequest, res: Response) {
  const institutionId = institutionIdFrom(req);
  const { academicYearId, subjectId, gradeLevelId, nameAr, nameHe, isActive, archivedAt } = req.body;
  if (!academicYearId || !subjectId || !gradeLevelId || !nameAr) return res.status(400).json({ error: 'academicYearId, subjectId, gradeLevelId and nameAr are required' });
  const [subject, year, gradeLevel] = await Promise.all([prisma.subject.findFirst({ where: { id: subjectId, institutionId, academicYearId } }), validAcademicYear(institutionId, academicYearId), validGradeLevel(gradeLevelId)]);
  if (!subject || !year || !gradeLevel) return res.status(400).json({ error: 'المادة أو السنة أو الصف المحدد غير صالح للسياق الحالي.' });
  const inserted = await prisma.skill.create({
    data: { institutionId, academicYearId, subjectId, gradeLevelId, nameAr, nameHe: nameHe || null, isActive: isActive !== undefined ? Boolean(isActive) : true, archivedAt: nullableDate(archivedAt), createdBy: uuid(req.user?.uid) },
  });
  return res.status(201).json(inserted);
}

export async function updateSkillsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const institutionId = institutionIdFrom(req);
  const existing = await prisma.skill.findFirst({ where: { id, institutionId } });
  if (!existing) return res.status(404).json({ error: 'Skill not found' });
  const { academicYearId, subjectId, gradeLevelId, nameAr, nameHe, isActive, archivedAt } = req.body;
  const [subject, year] = await Promise.all([
    prisma.subject.findFirst({ where: { id: String(subjectId || existing.subjectId), institutionId } }),
    prisma.academicYear.findFirst({ where: { id: String(academicYearId || existing.academicYearId), institutionId } }),
  ]);
  if (!subject || !year) return res.status(400).json({ error: 'المادة أو السنة الدراسية لا تنتمي إلى المؤسسة الحالية.' });
  if (subject.academicYearId !== year.id) return res.status(400).json({ error: 'المادة والسنة الدراسية غير متوافقتين.' });
  const updated = await prisma.skill.update({ where: { id }, data: { academicYearId: year.id, subjectId: subject.id, gradeLevelId: gradeLevelId || existing.gradeLevelId, nameAr, nameHe: nameHe || null, isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive, archivedAt: nullableDate(archivedAt), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
  return res.json(updated);
}

export async function deleteSkillsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const existing = await prisma.skill.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'Skill not found' });
  await prisma.skill.delete({ where: { id } });
  return res.json({ message: 'Skill deleted successfully', id });
}
