import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import type { NextFunction, Response } from 'express';
import type { ContextRequest } from './context';
import { tenantIsolationMiddleware } from './tenantIsolation.middleware';

async function executeWithoutTenant(user: ContextRequest['user']) {
  let statusCode: number | undefined;
  let responseBody: unknown;
  let nextCalled = false;
  const req = { path: '/api/students', user } as ContextRequest;
  const res = { status(code: number) { statusCode = code; return this; }, json(body: unknown) { responseBody = body; return this; } } as unknown as Response;
  const next = (() => { nextCalled = true; }) as NextFunction;
  await tenantIsolationMiddleware(req, res, next);
  return { statusCode, responseBody, nextCalled };
}

describe('tenantIsolationMiddleware', () => {
  test('requires an authenticated identity before resolving institution context', async () => {
    const result = await executeWithoutTenant(undefined);
    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalled, false);
    assert.deepEqual(typeof result.responseBody, 'object');
  });

  test('does not grant access when the request has no authenticated identity', async () => {
    const result = await executeWithoutTenant(undefined);
    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalled, false);
  });
});
