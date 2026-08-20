import assert from 'node:assert/strict';
import test from 'node:test';
import { testAdminPrisma as platformPrisma } from '../db/test-admin-prisma';
import { prisma } from '../db/prisma';
import { completeAccountSetup } from '../controllers/account-setup.controller';
import { createAuthChangePassword, createAuthLogin } from '../controllers/auth.controller';
import {
  createInstitutionUsers,
  getInstitutionUsers,
  patchInstitutionUsersById,
  reissueInstitutionUserSetup,
} from '../controllers/users.controller';
import { requirePermission } from '../middleware/permission.middleware';
import { requirePlatformAdmin } from '../middleware/platform-auth.middleware';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { isArgon2idHash, verifyPassword } from './password';
import { setupTokenHash } from '../services/account-setup.service';

type Invocation = { statusCode: number; body: any; headers: Map<string, unknown> };

async function invoke(handler: any, req: any): Promise<Invocation> {
  let statusCode = 200;
  let body: any;
  const headers = new Map<string, unknown>();
  const res: any = {
    getHeader: (name: string) => headers.get(name),
    setHeader: (name: string, value: unknown) => { headers.set(name, value); return res; },
    status(code: number) { statusCode = code; return res; },
    json(value: any) { body = value; return res; },
  };
  await handler({ headers: {}, ip: '127.0.0.1', params: {}, body: {}, ...req } as any, res);
  return { statusCode, body, headers };
}

async function invokeSchool(institutionId: string, handler: any, req: any): Promise<Invocation> {
  return withRlsContext(institutionId, () => invoke(handler, { context: { institutionId }, ...req }));
}

function tokenFromSetupUrl(url: string): string {
  return new URL(url).searchParams.get('token') || '';
}

test('Phase 10B-2: school accounts use setup tokens and secure credential lifecycle', async () => {
  const previousNodeEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'development';
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const base = await platformPrisma.institution.findFirstOrThrow();
  const institutions = await Promise.all(['A', 'B'].map((label) => platformPrisma.institution.create({ data: {
    schoolCode: `10B2${label}${suffix}`.slice(0, 20),
    slug: `phase-10b2-${label.toLowerCase()}-${suffix}`.slice(0, 80),
    nameAr: `Phase 10B-2 ${label}`,
    typeId: base.typeId,
    regionId: base.regionId,
    townId: base.townId,
    statusId: base.statusId,
    defaultLanguageId: base.defaultLanguageId,
  } })));
  const [institutionA, institutionB] = institutions;
  const createdUsers: Array<{ userId: string; institutionUserId: string; staffMemberId: string }> = [];
  let platformActorId = '';

  const createPending = async (institutionId: string, label: string, production = false) => {
    const staff = await platformPrisma.staffMember.create({ data: {
      institutionId,
      firstNameAr: `User ${label}`,
      familyNameAr: 'Phase10B2',
      nationalId: `${suffix}${label}`.slice(-10),
    } });
    const oldEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = production ? 'production' : 'development';
    try {
      const response = await invokeSchool(institutionId, createInstitutionUsers, {
        user: { uid: undefined },
        body: { staffMemberId: staff.id, email: `phase10b2-${label}-${suffix}@test.local`, roleIds: [] },
      });
      assert.equal(response.statusCode, 201);
      createdUsers.push({ userId: response.body.userId, institutionUserId: response.body.id, staffMemberId: staff.id });
      return response;
    } finally {
      process.env['NODE_ENV'] = oldEnv;
    }
  };

  try {
    const main = await createPending(institutionA.id, 'main');
    assert.equal(main.body.accountStatus, 'PENDING_SETUP');
    assert.ok(main.body.setup.setupUrl);
    assert.equal('password' in main.body, false);
    assert.equal('passwordHash' in main.body, false);

    const mainRecord = await platformPrisma.user.findUniqueOrThrow({ where: { id: main.body.userId } });
    assert.equal(isArgon2idHash(mainRecord.passwordHash), true);
    assert.equal(await verifyPassword('school_user_123', mainRecord.passwordHash), false);
    assert.equal(await verifyPassword('school_reset_1234', mainRecord.passwordHash), false);

    const firstRawToken = tokenFromSetupUrl(main.body.setup.setupUrl);
    assert.ok(firstRawToken.length >= 40);
    const firstStoredToken = await platformPrisma.userAccountSetupToken.findFirstOrThrow({ where: { userId: main.body.userId }, orderBy: { createdAt: 'desc' } });
    assert.equal(firstStoredToken.tokenHash, setupTokenHash(firstRawToken));
    assert.notEqual(firstStoredToken.tokenHash, firstRawToken);

    const pendingLogin = await invoke(createAuthLogin, { body: { email: mainRecord.email, password: 'school_user_123' } });
    assert.equal(pendingLogin.statusCode, 403);
    assert.equal(pendingLogin.body.code, 'ACCOUNT_SETUP_REQUIRED');
    assert.equal((await invoke(completeAccountSetup, { body: { token: 'wrong-token', password: 'ValidPass123', confirmPassword: 'ValidPass123' } })).statusCode, 400);

    await platformPrisma.userAccountSetupToken.update({ where: { id: firstStoredToken.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await invoke(completeAccountSetup, { body: { token: firstRawToken, password: 'ValidPass123', confirmPassword: 'ValidPass123' } })).statusCode, 400);

    const reissued = await invokeSchool(institutionA.id, reissueInstitutionUserSetup, { params: { id: main.body.id }, user: {} });
    assert.equal(reissued.statusCode, 200);
    const secondRawToken = tokenFromSetupUrl(reissued.body.setup.setupUrl);
    assert.notEqual(secondRawToken, firstRawToken);
    assert.equal((await platformPrisma.userAccountSetupToken.findUniqueOrThrow({ where: { id: firstStoredToken.id } })).usedAt instanceof Date, true);
    assert.equal((await invoke(completeAccountSetup, { body: { token: firstRawToken, password: 'ValidPass123', confirmPassword: 'ValidPass123' } })).statusCode, 400);

    const concurrent = await Promise.all([
      invoke(completeAccountSetup, { body: { token: secondRawToken, password: 'ValidPass123', confirmPassword: 'ValidPass123' } }),
      invoke(completeAccountSetup, { body: { token: secondRawToken, password: 'ValidPass123', confirmPassword: 'ValidPass123' } }),
    ]);
    assert.deepEqual(concurrent.map((item) => item.statusCode).sort((a, b) => a - b), [200, 400]);
    assert.equal((await invoke(completeAccountSetup, { body: { token: secondRawToken, password: 'ValidPass123', confirmPassword: 'ValidPass123' } })).statusCode, 400);

    const activeLogin = await invoke(createAuthLogin, { body: { email: mainRecord.email, password: 'ValidPass123' } });
    assert.equal(activeLogin.statusCode, 200);
    assert.ok(activeLogin.body.accessToken);
    assert.equal(activeLogin.body.refreshToken, undefined);
    const setCookie = activeLogin.headers.get('Set-Cookie');
    const cookieText = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
    assert.match(cookieText, /school_refresh_token=/);
    assert.match(cookieText, /HttpOnly/i);
    assert.equal((await invokeSchool(institutionA.id, reissueInstitutionUserSetup, { params: { id: main.body.id }, user: {} })).statusCode, 409);

    const productionPending = await createPending(institutionA.id, 'production', true);
    assert.equal(productionPending.body.setup.setupUrl, undefined);
    assert.equal(JSON.stringify(productionPending.body).includes('token'), false);
    assert.equal(JSON.stringify(productionPending.body).toLowerCase().includes('password'), false);

    const disabled = await createPending(institutionA.id, 'disabled');
    const disabledRawToken = tokenFromSetupUrl(disabled.body.setup.setupUrl);
    await platformPrisma.user.update({ where: { id: disabled.body.userId }, data: { isActive: false } });
    const disabledSetup = await invoke(completeAccountSetup, { body: { token: disabledRawToken, password: 'ValidPass123', confirmPassword: 'ValidPass123' } });
    assert.equal(disabledSetup.statusCode, 409);
    assert.equal(disabledSetup.body.code, 'ACCOUNT_DISABLED');

    const schoolB = await createPending(institutionB.id, 'school-b');
    assert.equal((await invokeSchool(institutionA.id, reissueInstitutionUserSetup, { params: { id: schoolB.body.id }, user: {} })).statusCode, 404);
    assert.equal((await invokeSchool(institutionA.id, patchInstitutionUsersById, { params: { id: schoolB.body.id }, body: { password: 'Blocked123' } })).statusCode, 404);
    const visibleToA = await invokeSchool(institutionA.id, getInstitutionUsers, {});
    assert.equal(visibleToA.statusCode, 200);
    assert.equal(visibleToA.body.some((item: any) => item.id === schoolB.body.id), false);

    const badCreateStaff = await platformPrisma.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: 'Bad', familyNameAr: 'Password', nationalId: `${suffix}x`.slice(-10) } });
    const badCreate = await invokeSchool(institutionA.id, createInstitutionUsers, { body: { staffMemberId: badCreateStaff.id, email: `bad-${suffix}@test.local`, password: 'TempPass123', roleIds: [] } });
    assert.equal(badCreate.statusCode, 400);
    assert.equal(badCreate.body.code, 'TEMPORARY_PASSWORD_NOT_ALLOWED');
    await platformPrisma.staffMember.delete({ where: { id: badCreateStaff.id } });

    const changeWrong = await invokeSchool(institutionA.id, createAuthChangePassword, { user: { uid: main.body.userId }, body: { currentPassword: 'WrongPass123', newPassword: 'NewValid123', confirmPassword: 'NewValid123' } });
    assert.equal(changeWrong.statusCode, 401);
    const changeWeak = await invokeSchool(institutionA.id, createAuthChangePassword, { user: { uid: main.body.userId }, body: { currentPassword: 'ValidPass123', newPassword: 'weak', confirmPassword: 'weak' } });
    assert.equal(changeWeak.statusCode, 400);
    const changeSame = await invokeSchool(institutionA.id, createAuthChangePassword, { user: { uid: main.body.userId }, body: { currentPassword: 'ValidPass123', newPassword: 'ValidPass123', confirmPassword: 'ValidPass123' } });
    assert.equal(changeSame.statusCode, 400);
    const changed = await invokeSchool(institutionA.id, createAuthChangePassword, { user: { uid: main.body.userId }, body: { currentPassword: 'ValidPass123', newPassword: 'NewValid123', confirmPassword: 'NewValid123' } });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.body.sessionsRevoked, true);
    const changedRecord = await platformPrisma.user.findUniqueOrThrow({ where: { id: main.body.userId } });
    assert.equal(isArgon2idHash(changedRecord.passwordHash), true);
    assert.equal(await verifyPassword('ValidPass123', changedRecord.passwordHash), false);
    assert.equal(await verifyPassword('NewValid123', changedRecord.passwordHash), true);
    assert.equal(await platformPrisma.userSession.count({ where: { userId: main.body.userId, revokedAt: null } }), 0);
    assert.equal((await invoke(createAuthLogin, { body: { email: mainRecord.email, password: 'ValidPass123' } })).statusCode, 401);
    assert.equal((await invoke(createAuthLogin, { body: { email: mainRecord.email, password: 'NewValid123' } })).statusCode, 200);

    const permission = await platformPrisma.permission.upsert({ where: { module_action: { module: 'settings', action: 'CREATE' } }, update: { isActive: true }, create: { module: 'settings', action: 'CREATE', nameAr: 'Manage settings' } });
    const role = await platformPrisma.role.create({ data: { institutionId: institutionA.id, nameAr: 'Phase 10B-2 manager' } });
    await platformPrisma.rolePermission.create({ data: { institutionId: institutionA.id, roleId: role.id, permissionId: permission.id } });
    await platformPrisma.institutionUserRole.create({ data: { institutionId: institutionA.id, institutionUserId: main.body.id, roleId: role.id } });
    let permissionAllowed = false;
    await withRlsContext(institutionA.id, () => requirePermission('settings', 'create')({ context: { institutionId: institutionA.id }, user: { uid: main.body.userId } } as any, { status: () => ({ json: () => undefined }) } as any, () => { permissionAllowed = true; }));
    assert.equal(permissionAllowed, true);

    platformActorId = (await platformPrisma.user.create({ data: { email: `platform-10b2-${suffix}@test.local`, normalizedEmail: `platform-10b2-${suffix}@test.local`, passwordHash: changedRecord.passwordHash, isActive: true, isPlatformAdmin: true } })).id;
    const platformSchoolDenied = await invoke((req: any, res: any) => requirePermission('settings', 'create')(req, res, () => res.json({ allowed: true })), { user: { uid: platformActorId } });
    assert.equal(platformSchoolDenied.statusCode, 403);
    const schoolPlatformDenied = await invoke((req: any, res: any) => requirePlatformAdmin(req, res, () => res.json({ allowed: true })), { user: { uid: main.body.userId } });
    assert.equal(schoolPlatformDenied.statusCode, 403);

    const actions = await platformPrisma.auditLog.findMany({ where: { institutionId: institutionA.id }, select: { action: true, metadata: true } });
    for (const action of ['USER_CREATED', 'ACCOUNT_SETUP_ISSUED', 'ACCOUNT_SETUP_REISSUED', 'ACCOUNT_SETUP_COMPLETED', 'PASSWORD_CHANGED']) {
      assert.equal(actions.some((item) => item.action === action), true, `Missing audit event ${action}`);
    }
    assert.equal(JSON.stringify(actions).includes(secondRawToken), false);
    assert.equal(JSON.stringify(actions).toLowerCase().includes('passwordhash'), false);
  } finally {
    process.env['NODE_ENV'] = previousNodeEnv;
    const remainingMemberships = await platformPrisma.institutionUser.findMany({ where: { institutionId: { in: institutions.map((item) => item.id) } }, select: { userId: true } });
    const userIds = [...new Set([...createdUsers.map((item) => item.userId), ...remainingMemberships.map((item) => item.userId)])];
    await platformPrisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await platformPrisma.userAccountSetupToken.deleteMany({ where: { userId: { in: userIds } } });
    await platformPrisma.auditLog.deleteMany({ where: { institutionId: { in: institutions.map((item) => item.id) } } });
    await platformPrisma.platformAuditLog.deleteMany({ where: { targetInstitutionId: { in: institutions.map((item) => item.id) } } });
    await platformPrisma.institutionUserRole.deleteMany({ where: { institutionId: { in: institutions.map((item) => item.id) } } });
    await platformPrisma.rolePermission.deleteMany({ where: { institutionId: { in: institutions.map((item) => item.id) } } });
    await platformPrisma.role.deleteMany({ where: { institutionId: { in: institutions.map((item) => item.id) } } });
    await platformPrisma.institutionUser.deleteMany({ where: { institutionId: { in: institutions.map((item) => item.id) } } });
    await platformPrisma.staffMember.deleteMany({ where: { institutionId: { in: institutions.map((item) => item.id) } } });
    await platformPrisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (platformActorId) await platformPrisma.user.deleteMany({ where: { id: platformActorId } });
    await platformPrisma.institution.deleteMany({ where: { id: { in: institutions.map((item) => item.id) } } });
  }
});
