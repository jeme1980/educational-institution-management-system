import { strict as assert } from 'node:assert';
import http from 'node:http';
import app from '../server';
import { prisma } from '../db/prisma';
import { testAdminPrisma } from '../db/test-admin-prisma';
import { tenantIsolationMiddleware } from '../middleware/tenantIsolation.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import type { ContextRequest } from '../middleware/context';
import type { Response, NextFunction } from 'express';
import { withRlsContext } from '../middleware/rls-request.middleware';

function request(server: http.Server, path: string): Promise<number> {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  return fetch(`http://127.0.0.1:${address.port}${path}`).then((response) => response.status);
}

const server = http.createServer(app);

async function main() {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    for (const path of ['/api/students', '/api/staff', '/api/exams', '/api/institutions', '/api/public-lookups']) {
      const status = await request(server, path);
      assert.equal(status, 401, `Expected ${path} to require authentication`);
    }

    const identity = await testAdminPrisma.user.findFirst({
      where: { isActive: true, institutionUser: { is: { isActive: true, archivedAt: null, roles: { some: { role: { isActive: true, archivedAt: null, rolePermissions: { some: { permission: { module: 'students', action: 'READ', isActive: true } } } } } } } } },
      select: { id: true, email: true },
    });
    if (identity) {
      const membership = await testAdminPrisma.institutionUser.findFirst({
        where: { userId: identity.id, isActive: true, archivedAt: null },
        select: { institutionId: true },
      });
      assert.ok(membership, 'Seeded identity must have an active institution membership');
      let statusCode: number | undefined;
      let nextCalled = false;
      const response = {
        getHeader() { return undefined; },
        setHeader() { return this; },
        status(code: number) { statusCode = code; return this; },
        json() { return this; },
      } as unknown as Response;
      const request = {
        user: { uid: identity.id, email: identity.email },
        institutionId: '00000000-0000-4000-8000-000000000099',
        context: { institutionId: '00000000-0000-4000-8000-000000000099', academicYearId: '' },
      } as ContextRequest;
      await tenantIsolationMiddleware(request, response, (() => { nextCalled = true; }) as NextFunction);
      assert.equal(statusCode, 403, 'An institution header from another institution must be rejected');
      assert.equal(nextCalled, false);

      let permissionNextCalled = false;
      const permissionRequest = {
        user: { uid: identity.id, email: identity.email },
        institutionId: membership.institutionId,
        context: { institutionId: membership.institutionId, academicYearId: '' },
      } as ContextRequest;
      await withRlsContext(membership.institutionId, () => requirePermission('students', 'read')(permissionRequest, response, (() => { permissionNextCalled = true; }) as NextFunction));
      assert.equal(permissionNextCalled, true, 'Persisted role permission should authorize the seeded administrator');

      statusCode = undefined;
      permissionNextCalled = false;
      await withRlsContext(membership.institutionId, () => requirePermission('permission-that-does-not-exist', 'read')(permissionRequest, response, (() => { permissionNextCalled = true; }) as NextFunction));
      assert.equal(statusCode, 403, 'A missing permission must be denied by the backend');
      assert.equal(permissionNextCalled, false);
    }
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  server.close();
  throw error;
});
