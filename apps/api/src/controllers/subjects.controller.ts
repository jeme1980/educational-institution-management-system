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
  const subjects = await prisma.subject.findMany({
    where: { institutionId: institutionIdFrom(req), academicYearId: academicYearIdFrom(req) },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(subjects);
}

export async function createSubjects(req: AuthRequest, res: Response) {
  const institutionId = institutionIdFrom(req);
  const { nameAr, nameHe, isActive, archivedAt } = req.body;
  const resolvedAcademicYearId = req.context?.academicYearId || '';
  if (!resolvedAcademicYearId || !nameAr) return res.status(400).json({ error: 'academicYearId and nameAr are required' });
  const inserted = await prisma.subject.create({
    data: {
      institutionId,
      academicYearId: String(resolvedAcademicYearId),
      nameAr,
      nameHe: nameHe || null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      archivedAt: nullableDate(archivedAt),
      createdBy: uuid(req.user?.uid),
    },
  });
  return res.status(201).json(inserted);
}

export async function updateSubjectsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const institutionId = institutionIdFrom(req);
  const existing = await prisma.subject.findFirst({ where: { id, institutionId } });
  if (!existing) return res.status(404).json({ error: 'Subject not found' });
  const { academicYearId, nameAr, nameHe, isActive, archivedAt } = req.body;
  const year = await prisma.academicYear.findFirst({ where: { id: String(academicYearId || existing.academicYearId), institutionId } });
  if (!year) return res.status(400).json({ error: 'السنة الدراسية لا تنتمي إلى المؤسسة الحالية.' });
  const updated = await prisma.subject.update({
    where: { id },
    data: {
      academicYearId: year.id,
      nameAr,
      nameHe: nameHe || null,
      isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      archivedAt: nullableDate(archivedAt),
      updatedAt: new Date(),
      updatedBy: uuid(req.user?.uid),
    },
  });
  return res.json(updated);
}

export async function deleteSubjectsById(req: AuthRequest, res: Response) {
  const id = String(req.params['id']);
  const existing = await prisma.subject.findFirst({ where: { id, institutionId: institutionIdFrom(req) } });
  if (!existing) return res.status(404).json({ error: 'Subject not found' });
  await prisma.subject.delete({ where: { id } });
  return res.json({ message: 'Subject deleted successfully', id });
}

export async function getTopics(req: ContextRequest, res: Response) {
  return res.json(await topicResponse(institutionIdFrom(req), academicYearIdFrom(req)));
}

export async function createTopics(req: AuthRequest, res: Response) {
  const institutionId = institutionIdFrom(req);
  const { academicYearId, subjectId, gradeLevelId, nameAr, nameHe, isActive, archivedAt } = req.body;
  if (!academicYearId || !subjectId || !gradeLevelId || !nameAr) return res.status(400).json({ error: 'academicYearId, subjectId, gradeLevelId and nameAr are required' });
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, institutionId } });
  if (!subject) return res.status(400).json({ error: 'Subject not found for this institution' });
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
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, institutionId } });
  if (!subject) return res.status(400).json({ error: 'Subject not found for this institution' });
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
