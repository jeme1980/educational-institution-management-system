import { strict as assert } from 'node:assert';
import 'dotenv/config';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { createAuthChangePassword, createAuthLogin } from '../controllers/auth.controller';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { hashPassword, isArgon2idHash, isLegacyPasswordHash, legacySha256, verifyPassword } from './password';

async function invoke(handler: (req: any, res: any) => Promise<any>, req: any) {
  let statusCode = 200;
  let body: any;
  const headers = new Map<string, unknown>();
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: any) { body = value; return this; },
    getHeader(name: string) { return headers.get(name); },
    setHeader(name: string, value: unknown) { headers.set(name, value); return this; },
  };
  await handler(req, response);
  return { statusCode, body };
}

async function main() {
  const password = 'Phase5A-password!';
  const argonHash = await hashPassword(password);
  assert.ok(isArgon2idHash(argonHash), 'New hashes must use Argon2id');
  assert.equal(await verifyPassword(password, argonHash), true, 'Argon2id must verify a valid password');
  assert.equal(await verifyPassword('wrong-password', argonHash), false, 'Argon2id must reject an invalid password');

  const legacyHash = legacySha256(password);
  assert.ok(isLegacyPasswordHash(legacyHash), 'Legacy SHA-256 detection must be explicit');
  assert.equal(await verifyPassword(password, legacyHash), true, 'Legacy SHA-256 passwords must remain compatible');
  assert.equal(await verifyPassword('wrong-password', legacyHash), false, 'Legacy SHA-256 must reject an invalid password');

  const institution = await prisma.institution.findFirst({ select: { id: true } });
  assert.ok(institution, 'A test institution is required');
  const marker = `phase5a-${Date.now()}`;
  const staff = await prisma.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'Phase', familyNameAr: '5A' } });
  const user = await prisma.user.create({ data: { email: `${marker}@test.local`, normalizedEmail: `${marker}@test.local`, passwordHash: legacyHash, isActive: true } });
  const membership = await prisma.institutionUser.create({ data: { institutionId: institution.id, userId: user.id, staffMemberId: staff.id, isActive: true } });

  try {
    const login = await invoke(createAuthLogin, { body: { email: user.email, password } });
    assert.equal(login.statusCode, 200, 'A legacy user must be able to log in');
    assert.ok(login.body?.token, 'Login must return a token');
    assert.equal(login.body?.user?.passwordHash, undefined, 'Authentication responses must not expose passwordHash');

    const migrated = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    assert.ok(migrated && isArgon2idHash(migrated.passwordHash), 'Successful legacy login must migrate passwordHash to Argon2id');

    const secondLogin = await invoke(createAuthLogin, { body: { email: user.email, password } });
    assert.equal(secondLogin.statusCode, 200, 'Migrated user must log in using Argon2id verification');

    const changed = await withRlsContext(institution.id, () => invoke(createAuthChangePassword, {
      body: { currentPassword: password, newPassword: 'Phase5A-new-password!', confirmPassword: 'Phase5A-new-password!' },
      context: { institutionId: institution.id, academicYearId: '' },
      user: { uid: user.id, email: user.email, sid: JSON.parse(Buffer.from(secondLogin.body.token.split('.')[1], 'base64url').toString()).sid },
    }));
    assert.equal(changed.statusCode, 200, 'Password change must succeed');
    const changedHash = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    assert.ok(changedHash && isArgon2idHash(changedHash.passwordHash), 'Password changes must store Argon2id');
    assert.equal(await verifyPassword('Phase5A-new-password!', changedHash!.passwordHash), true);
  } finally {
    await prisma.institutionUser.delete({ where: { id: membership.id } });
    await prisma.auditLog.deleteMany({ where: { institutionId: institution.id, entityId: user.id, action: 'PASSWORD_CHANGED' } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.staffMember.delete({ where: { id: staff.id } });
    await prisma.$disconnect();
  }
  console.log('Password hashing hardening tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
