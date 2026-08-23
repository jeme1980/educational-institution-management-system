import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';

const uuid = (value: unknown): string | null => {
  const text = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
};

const contextIds = (req: ContextRequest) => ({
  institutionId: req.context?.institutionId || '',
  academicYearId: req.context?.academicYearId || '',
});

async function resolveClassRelationIds(stageValue: unknown, gradeValue: unknown, typeValue: unknown, compositionValue: unknown) {
  const [stage, grade, type, composition] = await Promise.all([
    uuid(stageValue) ? prisma.educationStage.findFirst({ where: { id: String(stageValue), isActive: true } }) : null,
    uuid(gradeValue) ? prisma.gradeLevel.findFirst({ where: { id: String(gradeValue), isActive: true } }) : null,
    uuid(typeValue) ? prisma.classType.findFirst({ where: { id: String(typeValue), isActive: true } }) : null,
    uuid(compositionValue) ? prisma.compositionType.findFirst({ where: { id: String(compositionValue), isActive: true } }) : null,
  ]);
  return { stageId: stage?.id, gradeLevelId: grade?.id, gradeCodeNumber: grade?.codeNumber, typeId: type?.id, compositionId: composition?.id };
}

export async function getClasses(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = contextIds(req);
  if (!institutionId || !academicYearId) return res.status(400).json({ error: 'institution and academic year context are required' });
  const classList = await prisma.class.findMany({
    where: { institutionId, academicYearId, archivedAt: null },
    include: { gradeLevel: true, stage: true, type: true, composition: true },
    orderBy: [{ gradeLevel: { sortOrder: 'asc' } }, { parallelNumber: 'asc' }],
  });
  const studentCounts = await prisma.studentEnrollment.groupBy({
    by: ['classId'],
    where: {
      institutionId,
      academicYearId,
      classId: { in: classList.map((item) => item.id) },
      isActive: true,
      isDeleted: false,
    },
    _count: { _all: true },
  });
  const countByClassId = new Map(studentCounts.map((item) => [item.classId, item._count._all]));
  return res.json(classList.map((item) => ({ ...item, studentCount: countByClassId.get(item.id) || 0 })));
}

export async function createClasses(req: AuthRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = contextIds(req);
  const { stageId, gradeLevelId, parallelNumber, nameAr, nameHe, typeId, compositionId } = req.body;
  const relations = await resolveClassRelationIds(stageId, gradeLevelId, typeId, compositionId);
  const normalizedParallelNumber = Number(parallelNumber);
  if (!institutionId || !academicYearId || !relations.stageId || !relations.gradeLevelId || !relations.typeId || !relations.compositionId || !String(nameAr || '').trim() || !Number.isInteger(normalizedParallelNumber) || normalizedParallelNumber < 1) {
    return res.status(400).json({ error: 'institution, academic year, stage, grade, class type, composition and name are required' });
  }
  const classCode = `${relations.gradeCodeNumber}-${normalizedParallelNumber}`;
  const activeDuplicate = await prisma.class.findFirst({
    where: {
      institutionId,
      academicYearId,
      archivedAt: null,
      OR: [
        { classCode },
        { stageId: relations.stageId, gradeLevelId: relations.gradeLevelId, parallelNumber: normalizedParallelNumber },
      ],
    },
    select: { id: true },
  });
  if (activeDuplicate) return res.status(409).json({ error: `A class with code ${classCode} already exists in this academic year`, code: 'CLASS_DUPLICATE' });
  try {
    const inserted = await prisma.class.create({
      data: {
        institutionId,
        academicYearId,
        stageId: relations.stageId,
        gradeLevelId: relations.gradeLevelId,
        parallelNumber: normalizedParallelNumber,
        classCode,
        nameAr: String(nameAr).trim(),
        nameHe: nameHe || null,
        typeId: relations.typeId,
        compositionId: relations.compositionId,
        createdBy: uuid(req.user?.uid),
        archivedAt: null,
      },
    });
    return res.status(201).json(inserted);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      // The unique key intentionally does not include archivedAt. If a previous
      // class was archived because it still had enrollments/groups, restore it
      // instead of making the user believe that an invisible record is blocking
      // the new class.
      const archivedClass = await prisma.class.findFirst({
          where: { institutionId, academicYearId, stageId: relations.stageId, gradeLevelId: relations.gradeLevelId, parallelNumber: normalizedParallelNumber, archivedAt: { not: null } },
      });
      if (archivedClass) {
        const restored = await prisma.class.update({
          where: { id: archivedClass.id },
          data: { nameAr: String(nameAr).trim(), nameHe: nameHe || null, typeId: relations.typeId, compositionId: relations.compositionId, classCode, archivedAt: null, updatedAt: new Date(), updatedBy: uuid(req.user?.uid) },
        });
        return res.status(201).json(restored);
      }
      return res.status(409).json({ error: `A class with code ${classCode} already exists in this academic year`, code: 'CLASS_DUPLICATE' });
    }
    throw error;
  }
}

export async function updateClassesById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const { institutionId, academicYearId } = contextIds(req);
  const existing = await prisma.class.findFirst({ where: { id, institutionId, academicYearId, archivedAt: null } });
  if (!existing) return res.status(404).json({ error: 'Class not found or unauthorized' });
  const { stageId, gradeLevelId, parallelNumber, nameAr, nameHe, typeId, compositionId } = req.body;
  const relations = await resolveClassRelationIds(stageId, gradeLevelId, typeId, compositionId);
  const normalizedParallelNumber = Number(parallelNumber);
  if (!relations.stageId || !relations.gradeLevelId || !relations.typeId || !relations.compositionId || !String(nameAr || '').trim() || !Number.isInteger(normalizedParallelNumber) || normalizedParallelNumber < 1) {
    return res.status(400).json({ error: 'stage, grade, class type, composition and name are required' });
  }
  const classCode = `${relations.gradeCodeNumber}-${normalizedParallelNumber}`;
  const activeDuplicate = await prisma.class.findFirst({
    where: {
      institutionId,
      academicYearId,
      archivedAt: null,
      id: { not: id },
      OR: [
        { classCode },
        { stageId: relations.stageId, gradeLevelId: relations.gradeLevelId, parallelNumber: normalizedParallelNumber },
      ],
    },
    select: { id: true },
  });
  if (activeDuplicate) return res.status(409).json({ error: `A class with code ${classCode} already exists in this academic year`, code: 'CLASS_DUPLICATE' });
  try {
    const updated = await prisma.class.update({
      where: { id },
      data: {
        stageId: relations.stageId, gradeLevelId: relations.gradeLevelId, parallelNumber: normalizedParallelNumber, classCode, nameAr: String(nameAr).trim(), nameHe: nameHe || null,
        typeId: relations.typeId, compositionId: relations.compositionId, updatedBy: uuid(req.user?.uid), updatedAt: new Date(),
      },
    });
    return res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: `A class with code ${classCode} already exists in this academic year`, code: 'CLASS_DUPLICATE' });
    throw error;
  }
}

export async function deleteClassesById(req: AuthRequest, res: Response): Promise<any> {
  const id = String(req.params['id']);
  const { institutionId, academicYearId } = contextIds(req);
  const existing = await prisma.class.findFirst({ where: { id, institutionId, academicYearId, archivedAt: null } });
  if (!existing) return res.status(404).json({ error: 'Class not found or unauthorized' });
  const [enrollmentCount, studyGroupCount] = await Promise.all([
    prisma.studentEnrollment.count({ where: { classId: id, institutionId, academicYearId, isDeleted: false } }),
    prisma.studyGroup.count({ where: { classId: id } }),
  ]);
  if (enrollmentCount === 0 && studyGroupCount === 0) {
    await prisma.class.delete({ where: { id } });
    return res.json({ success: true, deleted: true });
  }
  await prisma.class.update({ where: { id }, data: { archivedAt: new Date(), updatedAt: new Date(), updatedBy: uuid(req.user?.uid) } });
  return res.json({ success: true, archived: true });
}
