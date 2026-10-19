import { strict as assert } from 'node:assert';
import 'dotenv/config';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { prisma as runtimePrisma } from '../db/prisma';
import { createAuthChangePassword, createAuthLogin, logoutAllAuthSessions, logoutAuthSession, refreshAuthSession } from '../controllers/auth.controller';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { hashPassword } from './password';

process.env['COOKIE_SECURE'] = 'true';
process.env['CORS_ORIGINS'] = 'http://trusted.test';

async function invoke(handler: (req: any, res: any) => Promise<any>, req: any) {
  let statusCode = 200;
  let body: any;
  const headers = new Map<string, string | string[]>();
  const response = { status(code: number) { statusCode = code; return this; }, json(value: any) { body = value; return this; }, setHeader(name: string, value: string | string[]) { headers.set(name, value); return this; }, getHeader(name: string) { return headers.get(name); } };
  await handler(req, response);
  return { statusCode, body, headers };
}

function setCookieHeaderOf(result: { headers: Map<string, string | string[]> }): string {
  const value = result.headers.get('Set-Cookie');
  const first = Array.isArray(value) ? value[0] : value;
  assert.ok(first, 'A refresh cookie should be issued');
  return first;
}

function cookieOf(result: { headers: Map<string, string | string[]> }): string {
  const first = setCookieHeaderOf(result);
  return first.split(';', 1)[0];
}

async function main() {
  const institution = await prisma.institution.findFirst({ select: { id: true } });
  assert.ok(institution, 'A test institution is required');
  const marker = `phase5b-${Date.now()}`;
  const staff = await withRlsContext(institution.id, () => runtimePrisma.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'Phase', familyNameAr: '5B' } }));
  const passwordHash = await hashPassword('Phase5B-password!');
  const user = await withRlsContext(institution.id, () => prisma.user.create({ data: { email: `${marker}@test.local`, normalizedEmail: `${marker}@test.local`, passwordHash, isActive: true } }));
  const membership = await withRlsContext(institution.id, () => runtimePrisma.institutionUser.create({ data: { institutionId: institution.id, userId: user.id, staffMemberId: staff.id, isActive: true } }));
  try {
    const request = { body: { email: user.email, password: 'Phase5B-password!' }, headers: {}, ip: '127.0.0.1' };
    const login = await invoke(createAuthLogin, request);
    assert.equal(login.statusCode, 200);
    assert.ok(login.body.token);
    const loginCookie = cookieOf(login);
    const loginSetCookie = setCookieHeaderOf(login);
    assert.match(loginSetCookie, /HttpOnly/);
    assert.match(loginSetCookie, /Secure/);
    assert.match(loginSetCookie, /SameSite=lax/i);
    assert.match(loginSetCookie, /Path=\/api\/auth/);
    assert.equal('refreshToken' in login.body, false, 'Refresh token must not be returned in JSON');
    const untrusted = await invoke(refreshAuthSession, { body: {}, headers: { cookie: loginCookie, origin: 'http://evil.test' }, ip: '127.0.0.1' });
    assert.equal(untrusted.statusCode, 403, 'Untrusted origins must be blocked');
    const stored = await prisma.userSession.findFirst({ where: { userId: user.id } });
    assert.ok(stored?.refreshTokenHash && !stored.refreshTokenHash.includes(loginCookie), 'Only a hash may be stored');

    const refreshed = await invoke(refreshAuthSession, { body: { refreshToken: 'body-token-must-be-ignored' }, headers: { cookie: loginCookie, origin: 'http://trusted.test' }, ip: '127.0.0.1' });
    assert.equal(refreshed.statusCode, 200);
    const refreshedCookie = cookieOf(refreshed);
    assert.notEqual(refreshedCookie, loginCookie, 'Refresh must rotate');
    const replay = await invoke(refreshAuthSession, { body: {}, headers: { cookie: loginCookie }, ip: '127.0.0.1' });
    assert.equal(replay.statusCode, 401, 'The old refresh token must be rejected');
    assert.equal((await invoke(refreshAuthSession, { body: { refreshToken: loginCookie }, headers: {} })).statusCode, 401);

    await prisma.userSession.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await invoke(refreshAuthSession, { body: {}, headers: { cookie: refreshedCookie } })).statusCode, 401, 'Expired sessions must not refresh');

    const secondLogin = await invoke(createAuthLogin, request);
    assert.equal(secondLogin.statusCode, 200);
    const secondCookie = cookieOf(secondLogin);
    const singleLogout = await invoke(logoutAuthSession, { body: {}, headers: { cookie: secondCookie } });
    assert.equal(singleLogout.statusCode, 200);
    assert.equal((await invoke(refreshAuthSession, { body: {}, headers: { cookie: secondCookie } })).statusCode, 401, 'Logged-out sessions must not refresh');

    const thirdLogin = await invoke(createAuthLogin, request);
    assert.equal(thirdLogin.statusCode, 200);
    const thirdCookie = cookieOf(thirdLogin);
    const logoutAll = await invoke(logoutAllAuthSessions, { user: { uid: user.id, sid: JSON.parse(Buffer.from(thirdLogin.body.token.split('.')[1], 'base64url').toString()).sid }, body: {} });
    assert.equal(logoutAll.statusCode, 200);
    assert.equal((await invoke(refreshAuthSession, { body: {}, headers: { cookie: refreshedCookie } })).statusCode, 401);
    assert.equal((await invoke(refreshAuthSession, { body: {}, headers: { cookie: thirdCookie } })).statusCode, 401);

    const freshLogin = await invoke(createAuthLogin, request);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    assert.equal((await invoke(refreshAuthSession, { body: {}, headers: { cookie: cookieOf(freshLogin) } })).statusCode, 401, 'Disabled users must not refresh');
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    const membershipLogin = await invoke(createAuthLogin, request);
    await withRlsContext(institution.id, () => runtimePrisma.institutionUser.update({ where: { id: membership.id }, data: { isActive: false } }));
    assert.equal((await invoke(refreshAuthSession, { body: {}, headers: { cookie: cookieOf(membershipLogin) } })).statusCode, 403, 'Users without active membership must not refresh');
    await withRlsContext(institution.id, () => runtimePrisma.institutionUser.update({ where: { id: membership.id }, data: { isActive: true } }));
    const passwordLogin = await invoke(createAuthLogin, request);
    const changed = await withRlsContext(institution.id, () => invoke(createAuthChangePassword, { user: { uid: user.id, sid: JSON.parse(Buffer.from(passwordLogin.body.token.split('.')[1], 'base64url').toString()).sid }, body: { currentPassword: 'Phase5B-password!', newPassword: 'Phase5B-new!', confirmPassword: 'Phase5B-new!' } }));
    assert.equal(changed.statusCode, 200);
    assert.equal((await invoke(refreshAuthSession, { body: {}, headers: { cookie: cookieOf(passwordLogin) } })).statusCode, 401);
  } finally {
    await withRlsContext(institution.id, async () => {
      await prisma.userSession.deleteMany({ where: { userId: user.id } });
      await prisma.institutionUser.delete({ where: { id: membership.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.staffMember.delete({ where: { id: staff.id } });
    });
    await runtimePrisma.$disconnect();
    await prisma.$disconnect();
  }
  console.log('Session lifecycle security tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
