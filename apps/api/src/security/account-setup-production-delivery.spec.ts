import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import app from '../server';
import { testAdminPrisma } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';
import { hashPassword } from './password';
import { setupTokenHash } from '../services/account-setup.service';
import { provisionInitialSchoolAdmin, reissueInitialAdminSetup } from '../services/school-onboarding.service';

test('production delivers initial-admin setup only to the platform mutation caller', async () => {
  const previousEnvironment = process.env['NODE_ENV'];
  const previousBase = process.env['ACCOUNT_SETUP_URL_BASE'];
  const nonce = randomUUID().replaceAll('-', '');
  const adminEmail = `setup-admin-${nonce}@example.com`;
  const base = await testAdminPrisma.institution.findFirstOrThrow();
  const schoolUser = await testAdminPrisma.user.findFirstOrThrow({ where: { isActive: true, mustChangePassword: false, institutionUsers: { some: { isActive: true, archivedAt: null } } }, include: { institutionUsers: { where: { isActive: true, archivedAt: null }, take: 1 } } });
  let planId = '';
  let actorId = '';
  let institutionId = '';
  let server: ReturnType<typeof app.listen> | undefined;
  try {
    const plan = await testAdminPrisma.plan.create({ data: { code: `ACCT_${nonce.slice(0, 15)}`, nameAr: 'Account setup delivery fixture', maxStaff: 100, maxUsers: 100, isActive: true } });
    planId = plan.id;
    const actor = await testAdminPrisma.user.create({ data: { email: `setup-actor-${nonce}@example.com`, normalizedEmail: `setup-actor-${nonce}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
    actorId = actor.id;
    const institution = await testAdminPrisma.institution.create({ data: { schoolCode: `AS${nonce.slice(0, 16)}`, slug: `setup-delivery-${nonce}`, nameAr: 'Account setup delivery fixture', typeId: base.typeId, regionId: base.regionId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId } });
    institutionId = institution.id;
    await testAdminPrisma.institutionSubscription.create({ data: { institutionId, planId, status: 'ACTIVE', startsAt: new Date() } });

    process.env['NODE_ENV'] = 'production';
    delete process.env['ACCOUNT_SETUP_URL_BASE'];
    await assert.rejects(provisionInitialSchoolAdmin({ institutionId, email: adminEmail, firstNameAr: 'مدير', familyNameAr: 'اختبار', actorUserId: actorId }), { code: 'ACCOUNT_SETUP_URL_NOT_CONFIGURED' });
    assert.equal(await testAdminPrisma.user.count({ where: { normalizedEmail: adminEmail } }), 0);
    assert.equal(await testAdminPrisma.institutionUser.count({ where: { institutionId } }), 0);
    process.env['ACCOUNT_SETUP_URL_BASE'] = 'http://localhost:4200/account/setup';
    await assert.rejects(provisionInitialSchoolAdmin({ institutionId, email: adminEmail, firstNameAr: 'مدير', familyNameAr: 'اختبار', actorUserId: actorId }), { code: 'ACCOUNT_SETUP_URL_INVALID' });
    assert.equal(await testAdminPrisma.user.count({ where: { normalizedEmail: adminEmail } }), 0);

    process.env['ACCOUNT_SETUP_URL_BASE'] = 'https://school.example.com/account/setup';
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const platformToken = await createLocalAccessToken(actor.id, actor.email);
    const schoolToken = await createLocalAccessToken(schoolUser.id, schoolUser.email);
    const platformPath = `/api/platform/institutions/${institutionId}/initial-admin`;
    const post = (path: string, body: object, token?: string, school = false) => fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(school ? { 'x-institution-id': schoolUser.institutionUsers[0].institutionId } : {}) },
      body: JSON.stringify(body),
    });
    const get = (path: string) => fetch(`${origin}${path}`, { headers: { Authorization: `Bearer ${platformToken}` } });

    const provisionBody = { email: adminEmail, firstNameAr: 'مدير', familyNameAr: 'اختبار' };
    assert.equal((await post(platformPath, provisionBody)).status, 401);
    assert.equal((await post(platformPath, provisionBody, schoolToken, true)).status, 403);
    assert.equal((await post(`${platformPath}/reissue`, {}, schoolToken, true)).status, 403);

    const provision = await post(platformPath, provisionBody, platformToken);
    assert.equal(provision.status, 201);
    assert.match(provision.headers.get('cache-control') || '', /no-store/);
    assert.equal(provision.headers.get('pragma'), 'no-cache');
    const issued = await provision.json() as any;
    assert.match(issued.setup.setupUrl, /^https:\/\/school\.example\.com\/account\/setup\?token=/);
    assert.equal('tokenHash' in issued, false);
    assert.equal('password' in issued, false);
    assert.equal('rawToken' in issued.setup, false);
    const firstToken = new URL(issued.setup.setupUrl).searchParams.get('token') || '';
    const stored = await testAdminPrisma.userAccountSetupToken.findFirstOrThrow({ where: { userId: issued.userId }, orderBy: { createdAt: 'desc' } });
    assert.equal(stored.tokenHash, setupTokenHash(firstToken));
    assert.notEqual(stored.tokenHash, firstToken);

    const status = await get(platformPath);
    assert.equal(status.status, 200);
    const statusBody = JSON.stringify(await status.json());
    for (const secret of [firstToken, 'setupUrl', 'rawToken', 'tokenHash']) assert.equal(statusBody.includes(secret), false);
    const institutionRead = await get(`/api/platform/institutions/${institutionId}`);
    assert.equal(institutionRead.status, 200);
    assert.equal(JSON.stringify(await institutionRead.json()).includes('setupUrl'), false);
    const list = await get('/api/platform/institutions');
    assert.equal(list.status, 200);
    assert.equal(JSON.stringify(await list.json()).includes('setupUrl'), false);

    const reissue = await post(`${platformPath}/reissue`, {}, platformToken);
    assert.equal(reissue.status, 200);
    assert.match(reissue.headers.get('cache-control') || '', /no-store/);
    assert.equal(reissue.headers.get('pragma'), 'no-cache');
    const reissued = await reissue.json() as any;
    const secondToken = new URL(reissued.setup.setupUrl).searchParams.get('token') || '';
    assert.notEqual(secondToken, firstToken);
    assert.equal((await post('/api/account/setup', { token: firstToken, password: 'ReadyPass123!', confirmPassword: 'ReadyPass123!' })).status, 400);
    assert.equal(JSON.stringify(await (await get(platformPath)).json()).includes('setupUrl'), false);

    delete process.env['ACCOUNT_SETUP_URL_BASE'];
    await assert.rejects(reissueInitialAdminSetup({ institutionId, actorUserId: actorId }), { code: 'ACCOUNT_SETUP_URL_NOT_CONFIGURED' });
    assert.equal((await testAdminPrisma.userAccountSetupToken.findFirstOrThrow({ where: { tokenHash: setupTokenHash(secondToken) } })).usedAt, null);
    process.env['ACCOUNT_SETUP_URL_BASE'] = 'https://school.example.com/account/setup';

    const revoke = await post(`${platformPath}/revoke`, {}, platformToken);
    assert.equal(revoke.status, 200);
    assert.equal(JSON.stringify(await revoke.json()).includes('setupUrl'), false);
    assert.equal((await post('/api/account/setup', { token: secondToken, password: 'ReadyPass123!', confirmPassword: 'ReadyPass123!' })).status, 400);
    const revokedStatus = await get(platformPath);
    assert.equal((await revokedStatus.json() as any).status, 'SETUP_EXPIRED');

    const finalIssue = await post(`${platformPath}/reissue`, {}, platformToken);
    assert.equal(finalIssue.status, 200);
    const finalToken = new URL(((await finalIssue.json()) as any).setup.setupUrl).searchParams.get('token') || '';
    assert.equal((await post('/api/account/setup', { token: 'invalid-setup-token', password: 'ReadyPass123!', confirmPassword: 'ReadyPass123!' })).status, 400);
    const finalTokenHash = setupTokenHash(finalToken);
    const currentExpiry = (await testAdminPrisma.userAccountSetupToken.findFirstOrThrow({ where: { tokenHash: finalTokenHash } })).expiresAt;
    await testAdminPrisma.userAccountSetupToken.updateMany({ where: { tokenHash: finalTokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await post('/api/account/setup', { token: finalToken, password: 'ReadyPass123!', confirmPassword: 'ReadyPass123!' })).status, 400);
    await testAdminPrisma.userAccountSetupToken.updateMany({ where: { tokenHash: finalTokenHash }, data: { expiresAt: currentExpiry } });
    const completion = await post('/api/account/setup', { token: finalToken, password: 'ReadyPass123!', confirmPassword: 'ReadyPass123!' });
    assert.equal(completion.status, 200);
    assert.equal((await post('/api/account/setup', { token: finalToken, password: 'ReadyPass123!', confirmPassword: 'ReadyPass123!' })).status, 400);
    assert.equal((await (await get(platformPath)).json() as any).status, 'ACTIVE');

    const audit = await testAdminPrisma.platformAuditLog.findMany({ where: { targetInstitutionId: institutionId }, select: { action: true, metadata: true } });
    for (const action of ['INITIAL_ADMIN_PROVISIONED', 'ACCOUNT_SETUP_REISSUED', 'ACCOUNT_SETUP_REVOKED', 'ACCOUNT_SETUP_COMPLETED']) {
      assert.equal(audit.some((row) => row.action === action), true);
    }
    const auditText = JSON.stringify(audit);
    for (const secret of [firstToken, secondToken, finalToken, 'setupUrl', 'tokenHash']) assert.equal(auditText.includes(secret), false);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (previousEnvironment === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = previousEnvironment;
    if (previousBase === undefined) delete process.env['ACCOUNT_SETUP_URL_BASE']; else process.env['ACCOUNT_SETUP_URL_BASE'] = previousBase;
    if (institutionId) {
      const memberships = await testAdminPrisma.institutionUser.findMany({ where: { institutionId }, select: { id: true, userId: true, staffMemberId: true } });
      const userIds = memberships.map((row) => row.userId);
      await testAdminPrisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
      await testAdminPrisma.userAccountSetupToken.deleteMany({ where: { userId: { in: userIds } } });
      await testAdminPrisma.platformAuditLog.deleteMany({ where: { targetInstitutionId: institutionId } });
      await testAdminPrisma.auditLog.deleteMany({ where: { institutionId } });
      await testAdminPrisma.institutionUserRole.deleteMany({ where: { institutionId } });
      await testAdminPrisma.rolePermission.deleteMany({ where: { institutionId } });
      await testAdminPrisma.institutionUser.deleteMany({ where: { institutionId } });
      await testAdminPrisma.staffMember.deleteMany({ where: { id: { in: memberships.map((row) => row.staffMemberId) } } });
      await testAdminPrisma.role.deleteMany({ where: { institutionId } });
      await testAdminPrisma.user.deleteMany({ where: { id: { in: userIds } } });
      await testAdminPrisma.institutionSubscription.deleteMany({ where: { institutionId } });
      await testAdminPrisma.institution.delete({ where: { id: institutionId } });
    }
    if (actorId) await testAdminPrisma.user.delete({ where: { id: actorId } });
    if (planId) await testAdminPrisma.plan.delete({ where: { id: planId } });
  }
});
