import type { NextFunction, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma, runWithRequestTransaction } from '../db/prisma';
import type { ContextRequest } from './context';

/** Run an authenticated school request in a transaction-bound RLS context. */
export async function rlsRequestTransaction(
  req: ContextRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const institutionId = req.context?.institutionId || req.institutionId;
  if (!institutionId) {
    res.status(403).json({ error: 'An institution context is required.' });
    return;
  }

  try {
    const serializable = req.method === 'POST' && /^\/api\/academic-years\/rollover\/[^/]+\/execute\/?$/.test(req.originalUrl.split('?')[0]);
    await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_institution_id', $1, true)`,
        institutionId,
      );
      req.db = tx;
      await runWithRequestTransaction(tx, async () => new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        res.once('finish', finish);
        res.once('close', finish);
        try { next(); } catch (error) { settled = true; reject(error); }
      }));
    }, serializable ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : undefined);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: 'Failed to establish the institution database context.' });
    else console.error('RLS request transaction failed:', error);
  } finally {
    req.db = undefined;
  }
}

/** Use RLS for short auth/tenant lookups that happen before an HTTP request transaction exists. */
export async function withRlsContext<T>(institutionId: string, callback: () => Promise<T>): Promise<T> {
  return (prisma as any).$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_institution_id', $1, true)`, institutionId);
    return runWithRequestTransaction(tx, callback);
  });
}
