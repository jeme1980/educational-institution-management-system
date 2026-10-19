import { NextFunction, Response } from 'express';
import type { ContextRequest } from './context';
import { findAuthIdentityStateById } from '../db/auth-runtime.repository';

export async function requirePlatformAdmin(req: ContextRequest, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.uid;
  if (!userId) { res.status(401).json({ error: 'Authentication is required.' }); return; }
  const identity = await findAuthIdentityStateById(userId);
  const user = identity?.isActive && identity.isPlatformAdmin ? identity : null;
  if (!user) { res.status(403).json({ error: 'Platform administrator access is required.' }); return; }
  next();
}
