import { NextFunction, Response } from 'express';
import type { ContextRequest } from './context';
import { prisma } from '../db/prisma';

export async function requirePlatformAdmin(req: ContextRequest, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.uid;
  if (!userId) { res.status(401).json({ error: 'Authentication is required.' }); return; }
  const user = await prisma.user.findFirst({ where: { id: userId, isActive: true, isPlatformAdmin: true }, select: { id: true } });
  if (!user) { res.status(403).json({ error: 'Platform administrator access is required.' }); return; }
  next();
}
