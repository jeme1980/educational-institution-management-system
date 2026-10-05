import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { prisma } from '../db/prisma';
import type { ContextRequest } from './context';
import { errorHandler, HttpError } from './errorHandler.middleware';
import { rlsRequestTransaction } from './rls-request.middleware';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mockTransaction(run: (callback: (tx: object) => Promise<void>) => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(prisma, '$transaction');
  Object.defineProperty(prisma, '$transaction', { configurable: true, writable: true, value: run });
  return () => {
    if (original) Object.defineProperty(prisma, '$transaction', original);
    else Reflect.deleteProperty(prisma, '$transaction');
  };
}

test('a successful response remains unflushed until the request transaction commits', async () => {
  const commitGate = deferred();
  const callbackDone = deferred();
  const restoreTransaction = mockTransaction(async (callback) => {
    await callback({ $executeRawUnsafe: async () => undefined });
    callbackDone.resolve();
    await commitGate.promise;
  });
  const app = express();
  let response: express.Response | undefined;
  app.use((req, res, next) => {
    (req as ContextRequest).institutionId = 'tenant-a';
    response = res;
    void rlsRequestTransaction(req as ContextRequest, res, next);
  });
  app.post('/write', (_req, res) => res.status(201).json({ id: 'created' }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const request = fetch(`http://127.0.0.1:${port}/write`, { method: 'POST' });
    await callbackDone.promise;
    assert.equal(response?.headersSent, false, 'HTTP headers must wait for commit');
    commitGate.resolve();
    const result = await request;
    assert.equal(result.status, 201);
    assert.deepEqual(await result.json(), { id: 'created' });
  } finally {
    commitGate.resolve();
    restoreTransaction();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a commit failure cannot return the prepared success response', async () => {
  const restoreTransaction = mockTransaction(async (callback) => {
    await callback({ $executeRawUnsafe: async () => undefined });
    throw new Error('controlled commit failure');
  });
  const app = express();
  app.use((req, res, next) => {
    (req as ContextRequest).institutionId = 'tenant-a';
    void rlsRequestTransaction(req as ContextRequest, res, next);
  });
  app.post('/write', (_req, res) => res.status(201).json({ id: 'not-committed' }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const result = await fetch(`http://127.0.0.1:${port}/write`, { method: 'POST' });
    assert.equal(result.status, 500);
    assert.doesNotMatch(await result.text(), /not-committed/);
  } finally {
    restoreTransaction();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('downstream errors roll back and retain the error-handler response', async () => {
  let rolledBack = false;
  const restoreTransaction = mockTransaction(async (callback) => {
    try { await callback({ $executeRawUnsafe: async () => undefined }); }
    catch (error) { rolledBack = true; throw error; }
  });
  const app = express();
  app.use((req, res, next) => {
    (req as ContextRequest).institutionId = 'tenant-a';
    void rlsRequestTransaction(req as ContextRequest, res, next);
  });
  app.post('/write', (_req, _res, next) => next(new HttpError(409, 'Conflict', 'CONFLICT')));
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const result = await fetch(`http://127.0.0.1:${port}/write`, { method: 'POST' });
    assert.equal(result.status, 409);
    assert.equal((await result.json()).error.code, 'CONFLICT');
    assert.equal(rolledBack, true);
  } finally {
    restoreTransaction();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('binary responses remain intact after commit', async () => {
  const bytes = Buffer.from([0, 1, 2, 255]);
  const restoreTransaction = mockTransaction(async (callback) => { await callback({ $executeRawUnsafe: async () => undefined }); });
  const app = express();
  app.use((req, res, next) => {
    (req as ContextRequest).institutionId = 'tenant-a';
    void rlsRequestTransaction(req as ContextRequest, res, next);
  });
  app.get('/file', (_req, res) => res.type('application/octet-stream').send(bytes));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const result = await fetch(`http://127.0.0.1:${port}/file`);
    assert.equal(result.status, 200);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  } finally {
    restoreTransaction();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('client close rejects the pending transaction instead of committing', async () => {
  const routeEntered = deferred();
  const transactionFinished = deferred();
  let committed = false;
  const restoreTransaction = mockTransaction(async (callback) => {
    try {
      await callback({ $executeRawUnsafe: async () => undefined });
      committed = true;
    } catch (error) {
      transactionFinished.resolve();
      throw error;
    }
  });
  const app = express();
  app.use((req, res, next) => {
    (req as ContextRequest).institutionId = 'tenant-a';
    void rlsRequestTransaction(req as ContextRequest, res, next);
  });
  app.post('/write', () => { routeEntered.resolve(); });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const controller = new AbortController();
    const request = fetch(`http://127.0.0.1:${port}/write`, { method: 'POST', signal: controller.signal }).catch(() => undefined);
    await routeEntered.promise;
    controller.abort();
    await request;
    await transactionFinished.promise;
    assert.equal(committed, false);
  } finally {
    restoreTransaction();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
