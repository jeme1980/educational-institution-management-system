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

  const originalEnd = res.end.bind(res);
  const originalWrite = res.write.bind(res);
  const originalFlushHeaders = res.flushHeaders.bind(res);
  const bufferedWrites: { chunk: string | Uint8Array; encoding?: BufferEncoding }[] = [];
  let endArgs: unknown[] | undefined;
  let complete!: () => void;
  let fail!: (error: Error) => void;
  const responseReady = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; });
  const aborted = new Error('Client closed the request before its transaction completed.');
  const rejectedResponse = new Error('Request failed before its transaction committed.');
  let clientClosed = false;
  const onClose = () => {
    if (!res.writableFinished) {
      clientClosed = true;
      fail(aborted);
    }
  };
  res.once('close', onClose);

  // Express send/json terminate through end. Hold bytes and headers until Prisma
  // has completed the outer request transaction, including its COMMIT.
  res.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    bufferedWrites.push({ chunk: typeof chunk === 'string' ? chunk : Buffer.from(chunk), encoding: typeof encoding === 'string' ? encoding : undefined });
    (typeof encoding === 'function' ? encoding : callback)?.();
    return true;
  }) as typeof res.write;
  res.flushHeaders = (() => undefined) as typeof res.flushHeaders;
  res.end = ((...args: unknown[]) => {
    if (!endArgs) {
      endArgs = args;
      if (res.statusCode >= 400) fail(rejectedResponse);
      else complete();
    }
    return res;
  }) as typeof res.end;

  const restoreResponse = () => {
    res.end = originalEnd;
    res.write = originalWrite;
    res.flushHeaders = originalFlushHeaders;
    res.off('close', onClose);
  };
  const sendPreparedResponse = () => {
    restoreResponse();
    for (const { chunk, encoding } of bufferedWrites) {
      if (encoding) originalWrite(chunk, encoding);
      else originalWrite(chunk);
    }
    (originalEnd as (...args: unknown[]) => Response)(...(endArgs || []));
  };

  try {
    const serializable = req.method === 'POST' && /^\/api\/academic-years\/rollover\/[^/]+\/execute\/?$/.test(req.originalUrl.split('?')[0]);
    await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_institution_id', $1, true)`,
        institutionId,
      );
      req.db = tx;
      await runWithRequestTransaction(tx, async () => {
        try { next(); } catch (error) { fail(error as Error); }
        await responseReady;
      });
    }, serializable ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : undefined);
    if (!clientClosed) sendPreparedResponse();
  } catch (error) {
    restoreResponse();
    if (clientClosed) return;
    if (error === rejectedResponse && endArgs) {
      for (const { chunk, encoding } of bufferedWrites) {
        if (encoding) originalWrite(chunk, encoding);
        else originalWrite(chunk);
      }
      (originalEnd as (...args: unknown[]) => Response)(...endArgs);
    } else if (!res.headersSent) {
      for (const header of ['content-type', 'content-length', 'etag', 'last-modified', 'content-disposition']) res.removeHeader(header);
      res.status(500).json({ error: 'Failed to establish the institution database context.' });
    } else console.error('RLS request transaction failed:', error);
  } finally {
    restoreResponse();
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
