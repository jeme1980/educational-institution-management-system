import { Request, Response } from 'express';
import { prisma } from '../db/prisma';

export async function getTowns(req: Request, res: Response): Promise<any> {
  
  const list = await prisma.town.findMany({ orderBy: { nameAr: 'asc' } });
  return res.json(list);

}

export async function getTownById(req: Request, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const item = await prisma.town.findUnique({ where: { id } });
  if (!item) {
    return res.status(404).json({ error: 'Town not found' });
  }
  return res.json(item);

}

export async function createTown(req: Request, res: Response): Promise<any> {
  
  const { nameAr, nameHe } = req.body;
  if (!nameAr || !nameAr.trim()) {
    return res.status(400).json({ error: 'اسم البلدة بالعربية مطلوب' });
  }

  const inserted = await prisma.town.create({
    data: {
      nameAr: nameAr.trim(),
      nameHe: nameHe ? nameHe.trim() : null,
    },
  });

  return res.status(201).json(inserted);

}

export async function updateTown(req: Request, res: Response): Promise<any> {
  
  const id = req.params['id'] as string;
  const { nameAr, nameHe } = req.body;

  if (!nameAr || !nameAr.trim()) {
    return res.status(400).json({ error: 'اسم البلدة بالعربية مطلوب' });
  }

  const existing = await prisma.town.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Town not found' });
  }

  const updated = await prisma.town.update({
    where: { id },
    data: {
      nameAr: nameAr.trim(),
      nameHe: nameHe ? nameHe.trim() : null,
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
