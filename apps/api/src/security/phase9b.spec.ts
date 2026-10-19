import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../db/prisma';
import { testAdminPrisma as platformPrisma } from '../db/test-admin-prisma';
import { requirePlatformAdmin } from '../middleware/platform-auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { assignPlatformSubscription, renewPlatformSubscription, transitionPlatformSubscription } from '../services/platform-subscription.service';
import { createAuthLogin } from '../controllers/auth.controller';
import { hashPassword } from '../security/password';

const runMiddleware = async (middleware: any, req: any) => {
  let nextCalled = false; let statusCode = 0; let body: any;
  const res = { status: (code: number) => { statusCode = code; return { json: (value: any) => { body = value; } }; } };
  await middleware(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode, body };
};

test('Phase 9B: platform identity, boundaries and subscription administration', async () => {
  const base = await platformPrisma.institution.findFirstOrThrow();
  const suffix = Date.now().toString().slice(-8);
  const institution = await platformPrisma.institution.create({ data: { schoolCode: `9B${suffix}`, slug: `phase-9b-${suffix}`, nameAr: 'Phase 9B institution', typeId: base.typeId, regionId: base.regionId, townId: base.townId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId } });
  const planA = await platformPrisma.plan.create({ data: { code: `9B_A_${suffix}`, nameAr: 'Phase 9B A', maxStudents: 2 } });
  const planB = await platformPrisma.plan.create({ data: { code: `9B_B_${suffix}`, nameAr: 'Phase 9B B', maxStudents: 5 } });
  const platformUser = await platformPrisma.user.create({ data: { email: `platform-${suffix}@example.com`, normalizedEmail: `platform-${suffix}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
  const schoolUser = await platformPrisma.user.findFirstOrThrow({ where: { institutionUsers: { some: {} } } });
  try {
    assert.equal((await runMiddleware(requirePlatformAdmin, { user: { uid: platformUser.id } })).nextCalled, true);
    const schoolDenied = await runMiddleware(requirePlatformAdmin, { user: { uid: schoolUser.id } });
    assert.equal(schoolDenied.statusCode, 403);

    const platformSchoolApi = await runMiddleware(requirePermission('students', 'read'), { user: { uid: platformUser.id }, context: { institutionId: '', academicYearId: '' } });
    assert.equal(platformSchoolApi.statusCode, 403);

    let loginStatus = 0;
    let loginBody: any;
    const loginResponse: any = {
      getHeader: () => undefined,
      setHeader: () => loginResponse,
      status: (code: number) => { loginStatus = code; return loginResponse; },
      json: (value: any) => { loginBody = value; return loginResponse; },
    };
    await createAuthLogin({ body: { email: platformUser.email, password: 'Platform@2026!' }, ip: '127.0.0.1', headers: {} } as any, loginResponse);
    assert.equal(loginStatus, 0);
    assert.ok(loginBody.token);
    assert.equal(loginBody.user.role, 'PLATFORM_ADMIN');
    assert.equal(loginBody.context.institutionId, '');
    assert.equal(loginBody.context.isPlatformAdmin, true);

    const assigned = await assignPlatformSubscription({ institutionId: institution.id, planId: planA.id, actorUserId: platformUser.id });
    assert.equal(assigned.planId, planA.id);
    const replaced = await assignPlatformSubscription({ institutionId: institution.id, planId: planB.id, actorUserId: platformUser.id });
    assert.equal(replaced.planId, planB.id);
    const history = await platformPrisma.institutionSubscription.findMany({ where: { institutionId: institution.id }, orderBy: { startsAt: 'asc' } });
    assert.equal(history.length, 2);
    assert.equal(history.filter((row) => ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'].includes(row.status)).length, 1);
    const suspended = await transitionPlatformSubscription({ institutionId: institution.id, status: 'SUSPENDED', actorUserId: platformUser.id });
    assert.equal(suspended.status, 'SUSPENDED');
    const renewed = await renewPlatformSubscription({ institutionId: institution.id, endsAt: new Date(Date.now() + 86_400_000), actorUserId: platformUser.id });
    assert.equal(renewed.status, 'ACTIVE');
  } finally {
    await platformPrisma.platformAuditLog.deleteMany({ where: { actorUserId: platformUser.id } });
    await platformPrisma.userSession.deleteMany({ where: { userId: platformUser.id } });
    await platformPrisma.institutionSubscription.deleteMany({ where: { institutionId: institution.id } });
    await platformPrisma.institution.delete({ where: { id: institution.id } });
    await platformPrisma.plan.deleteMany({ where: { id: { in: [planA.id, planB.id] } } });
    await platformPrisma.user.delete({ where: { id: platformUser.id } });
  }
});
