import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import { resolvePlatformDatabaseUrl } from '../db/platform-database-config';
import { errorHandler, HttpError } from '../middleware/errorHandler.middleware';
import {
  accountSetupRateLimiter,
  changePasswordRateLimiter,
  createEndpointRateLimiter,
  endpointRateLimitPolicies,
  loginRateLimiter,
  refreshRateLimiter,
  setupTokenReissueRateLimiter,
} from '../middleware/rate-limiters.middleware';
import { checkDatabaseReadiness, readinessHttpStatus } from '../services/readiness.service';
import { createRequireActiveSubscription, getEffectiveSubscriptionState } from '../services/subscription.service';

function fakeSubscriptionDatabase(subscription: any, failure?: Error): any {
  const value = async () => {
    if (failure) throw failure;
    return subscription;
  };
  const count = async () => 0;
  return {
    institutionSubscription: { findFirst: value },
    student: { count },
    staffMember: { count },
    institutionUser: { count },
  };
}

async function invokeSubscriptionWrite(subscription: any, failure?: Error) {
  const request = { context: { institutionId: '00000000-0000-4000-8000-000000000001' } } as any;
  let statusCode = 200;
  let body: any;
  let continued = false;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as any;
  const middleware = createRequireActiveSubscription(fakeSubscriptionDatabase(subscription, failure));
  await middleware(request, response, () => { continued = true; });
  return { statusCode, body, continued };
}

async function exerciseLimiter(limiter: RequestHandler, limit: number): Promise<void> {
  const app = express();
  app.post('/', limiter, (_req, res) => res.status(204).end());
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/`;
    for (let index = 0; index < limit; index += 1) {
      const response = await fetch(url, { method: 'POST' });
      assert.equal(response.status, 204);
    }
    const blocked = await fetch(url, { method: 'POST' });
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json() as any).error.code, 'RATE_LIMITED');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Phase 10C-1: platform database configuration fails closed in production', () => {
  assert.throws(
    () => resolvePlatformDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://school-runtime.invalid/db' }),
    /PLATFORM_DATABASE_URL is required/,
  );
  assert.equal(
    resolvePlatformDatabaseUrl({ NODE_ENV: 'production', PLATFORM_DATABASE_URL: 'postgresql://platform.invalid/db', DATABASE_URL: 'postgresql://school.invalid/db' }),
    'postgresql://platform.invalid/db',
  );
  assert.equal(
    resolvePlatformDatabaseUrl({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://local-test.invalid/db' }),
    'postgresql://local-test.invalid/db',
  );

  const platformModule = path.resolve(__dirname, '../db/platform-prisma.js');
  const missing = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(platformModule)})`], {
    env: { ...process.env, NODE_ENV: 'production', PLATFORM_DATABASE_URL: '' },
    encoding: 'utf8',
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /PLATFORM_DATABASE_URL is required/);
  const configured = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(platformModule)})`], {
    env: { ...process.env, NODE_ENV: 'production', PLATFORM_DATABASE_URL: 'postgresql://platform.invalid/database' },
    encoding: 'utf8',
  });
  assert.equal(configured.status, 0);
});

test('Phase 10C-1: effective subscription state blocks inactive and missing subscriptions', async () => {
  const active = { status: 'ACTIVE', endsAt: null, trialEndsAt: null, plan: { code: 'STANDARD', maxStudents: 100, maxStaff: 20, maxUsers: 10 } };
  const legacy = { ...active, plan: { code: 'LEGACY', maxStudents: null, maxStaff: null, maxUsers: null } };
  const suspended = { ...active, status: 'SUSPENDED' };
  const expired = { ...active, endsAt: new Date(Date.now() - 60_000) };

  assert.equal((await invokeSubscriptionWrite(active)).continued, true);
  assert.equal((await invokeSubscriptionWrite(legacy)).continued, true);
  assert.equal((await invokeSubscriptionWrite(suspended)).body.code, 'SUBSCRIPTION_INACTIVE');
  assert.equal((await invokeSubscriptionWrite(expired)).body.code, 'SUBSCRIPTION_INACTIVE');
  const missing = await invokeSubscriptionWrite(null);
  assert.equal(missing.continued, false);
  assert.equal(missing.statusCode, 403);
  assert.equal(missing.body.code, 'NO_SUBSCRIPTION');

  const readable = await getEffectiveSubscriptionState('00000000-0000-4000-8000-000000000001', fakeSubscriptionDatabase(null));
  assert.equal(readable.status, 'NO_SUBSCRIPTION');
  assert.equal(readable.isActive, false);

  const databaseFailure = new Error('postgresql://secret@internal/database failed');
  await assert.rejects(() => invokeSubscriptionWrite(active, databaseFailure), databaseFailure);
  await assert.rejects(
    () => getEffectiveSubscriptionState('00000000-0000-4000-8000-000000000001', fakeSubscriptionDatabase({ ...active, plan: null })),
    /required plan relation/,
  );
});

test('Phase 10C-1: sensitive endpoint rate limits return the unified 429 contract', async () => {
  await exerciseLimiter(loginRateLimiter, endpointRateLimitPolicies.login.limit);
  await exerciseLimiter(refreshRateLimiter, endpointRateLimitPolicies.refresh.limit);
  await exerciseLimiter(accountSetupRateLimiter, endpointRateLimitPolicies.accountSetup.limit);
  await exerciseLimiter(changePasswordRateLimiter, endpointRateLimitPolicies.changePassword.limit);
  await exerciseLimiter(setupTokenReissueRateLimiter, endpointRateLimitPolicies.setupTokenReissue.limit);

  const resetLimiter = createEndpointRateLimiter({ windowMs: 50, limit: 1 });
  const app = express();
  app.post('/', resetLimiter, (_req, res) => res.status(204).end());
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/`;
    assert.equal((await fetch(url, { method: 'POST' })).status, 204);
    assert.equal((await fetch(url, { method: 'POST' })).status, 429);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal((await fetch(url, { method: 'POST' })).status, 204);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Phase 10C-1: production errors are sanitized while known errors remain mapped', () => {
  const invoke = (error: Error & { code?: string }) => {
    let statusCode = 0;
    let body: any;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as any;
    errorHandler(error, { method: 'GET', originalUrl: '/api/test', headers: {} } as any, response, (() => undefined) as any);
    return { statusCode, body };
  };

  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...values: unknown[]) => { logged.push(values); };
  try {
    const unknown = Object.assign(new Error('SQL failed at C:\\private\\server.ts using secret-password'), { code: 'P9999' });
    const result = invoke(unknown);
    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.body, { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' } });
    assert.equal(JSON.stringify(result.body).includes('secret-password'), false);
    assert.equal(JSON.stringify(result.body).includes('P9999'), false);
    assert.equal(logged.length, 1);

    const prismaConflict = invoke(Object.assign(new Error('Raw Prisma model and SQL details'), { code: 'P2002' }));
    assert.equal(prismaConflict.statusCode, 409);
    assert.equal(prismaConflict.body.error.code, 'RESOURCE_CONFLICT');
    assert.equal(JSON.stringify(prismaConflict.body).includes('Prisma'), false);

    const business = invoke(new HttpError(422, 'Known validation failure.', 'VALIDATION_FAILED'));
    assert.equal(business.statusCode, 422);
    assert.equal(business.body.error.message, 'Known validation failure.');
  } finally {
    console.error = originalConsoleError;
  }
});

test('Phase 10C-1: readiness requires both database clients and exposes no internals', async () => {
  const readyClient = { $queryRawUnsafe: async (query: string) => query.includes('pg_roles') ? [{ role_name: 'runtime_app', superuser: false, bypass_rls: false, create_database: false, create_role: false, replication: false }] : [{ '?column?': 1 }] };
  const failingClient = { $queryRawUnsafe: async () => { throw new Error('postgresql://secret@host/database'); } };
  const ready = await checkDatabaseReadiness(readyClient, readyClient);
  assert.deepEqual(ready, { status: 'ready', services: { schoolDatabase: 'ready', platformDatabase: 'ready' } });
  assert.equal(readinessHttpStatus(ready), 200);
  const unavailable = await checkDatabaseReadiness(readyClient, failingClient);
  assert.deepEqual(unavailable, { status: 'not_ready', services: { schoolDatabase: 'ready', platformDatabase: 'not_ready' } });
  assert.equal(readinessHttpStatus(unavailable), 503);
  assert.equal(JSON.stringify(unavailable).includes('secret'), false);

  const privilegedClient = { $queryRawUnsafe: async (query: string) => query.includes('pg_roles') ? [{ role_name: 'postgres', superuser: true, bypass_rls: true, create_database: true, create_role: true, replication: true }] : [{ '?column?': 1 }] };
  const unsafe = await checkDatabaseReadiness(readyClient, privilegedClient);
  assert.equal(readinessHttpStatus(unsafe), 503);
  assert.equal(unsafe.services.platformDatabase, 'not_ready');
});
