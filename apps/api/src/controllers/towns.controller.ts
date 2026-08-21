import { Request, Response } from 'express';
import { prisma } from '../db/prisma';

export async function getTowns(req: Request, res: Response): Promise<any> {
  
  const list = await prisma.town.findMany({ include: { region: true }, orderBy: { nameAr: 'asc' } });
  return res.json(list);

}

export async function getTownById(req: Request, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const item = await prisma.town.findUnique({ where: { id }, include: { region: true } });
  if (!item) {
    return res.status(404).json({ error: 'Town not found' });
  }
  return res.json(item);

}

export async function createTown(req: Request, res: Response): Promise<any> {
  
  const { nameAr, nameHe, regionId } = req.body;
  if (!nameAr || !nameAr.trim()) {
    return res.status(400).json({ error: 'اسم البلدة بالعربية مطلوب' });
  }
  if (!regionId || !(await prisma.region.findFirst({ where: { id: String(regionId), isActive: true }, select: { id: true } }))) {
    return res.status(400).json({ error: 'المنطقة النشطة مطلوبة للبلدة' });
  }

  const inserted = await prisma.town.create({
    data: {
      nameAr: nameAr.trim(),
      nameHe: nameHe ? nameHe.trim() : null,
      region: { connect: { id: String(regionId) } },
    },
  });

  return res.status(201).json(inserted);

}

export async function updateTown(req: Request, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const { nameAr, nameHe, regionId } = req.body;

  if (!nameAr || !nameAr.trim()) {
    return res.status(400).json({ error: 'اسم البلدة بالعربية مطلوب' });
  }

  const existing = await prisma.town.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Town not found' });
  }
  if (regionId && !(await prisma.region.findFirst({ where: { id: String(regionId), isActive: true }, select: { id: true } }))) {
    return res.status(400).json({ error: 'المنطقة النشطة غير صالحة' });
  }
  if (regionId && String(regionId) !== existing.regionId) {
    return res.status(409).json({ error: 'لا يمكن تغيير منطقة البلدة بعد إنشائها؛ أنشئ سجل بلدة منفصلًا للمنطقة الأخرى' });
  }

  const updated = await prisma.town.update({
    where: { id },
    data: {
      nameAr: nameAr.trim(),
      nameHe: nameHe ? nameHe.trim() : null,
      ...(regionId ? { regionId: String(regionId) } : {}),
      updatedAt: new Date(),
    },
  });

  return res.json(updated);

}

export async function deleteTown(req: Request, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;

  await prisma.$transaction(async (tx) => {
    await tx.institution.updateMany({ where: { townId: id }, data: { townId: null } });
    await tx.student.updateMany({ where: { townId: id }, data: { townId: null } });
    await tx.town.delete({ where: { id } });
  });

  return res.json({ success: true, id });

}
