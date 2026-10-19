import {findAuthIdentityByEmail, createAuthSession, authSessionById, authSessionByHash, rotateAuthSession, revokeAuthSession} from '../db/auth-runtime.repository';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { prisma } from '../db/prisma';
import { lockSchoolInstitution, schoolAccountSummaries, schoolInstitution, createSchoolIdentity } from '../db/school-runtime.repository';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { createAuthLogin } from '../controllers/auth.controller';
import { hashPassword } from './password';

const denied = (error: any) => /42501|permission denied|context mismatch/i.test(String(error?.message));

test('school runtime capability boundary works without direct global identity privileges', async () => {
  // Fixtures and the blocking probe are deliberately restricted to disposable instances.
  for (const key of ['TEST_ADMIN_DATABASE_URL', 'RLS_RUNTIME_DATABASE_URL', 'PLATFORM_DATABASE_URL']) {
    const url = new URL(process.env[key] || '');
    assert.equal(url.hostname, '127.0.0.1');
    assert.ok(Number(url.port) >= 55003);
    assert.notEqual(url.pathname, '/school');
  }
  const institution = await admin.institution.findFirstOrThrow();
  const id = randomUUID();
  const email = `capability-${id}@example.test`;
  const password = `Capability-${randomUUID()}!`;
  const staff = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'Contract', familyNameAr: 'Fixture' } });
  const user = await admin.user.create({ data: { id, email, normalizedEmail: email, passwordHash: await hashPassword(password), isActive: true } });
  await admin.institutionUser.create({ data: { institutionId: institution.id, userId: id, staffMemberId: staff.id } });
  const second = new PrismaClient({ datasourceUrl: process.env['RLS_RUNTIME_DATABASE_URL'] });
  try {
    for (const sql of ['SELECT id FROM public.users LIMIT 1', 'UPDATE public.users SET "lastLoginAt"=NULL WHERE false', 'SELECT id FROM public.institutions LIMIT 1', 'UPDATE public.institutions SET id=id WHERE false', 'SELECT id FROM public.user_sessions LIMIT 1', 'SELECT id FROM public.institutions FOR NO KEY UPDATE']) {
      // These static statements intentionally prove the database denies direct access.
      await assert.rejects(() => prisma.$queryRawUnsafe(sql), denied);
    }
    const functions = await admin.$queryRaw<{ safe: boolean; public_execute: boolean }[]>`
      SELECT p.prosecdef AND r.rolname='school_runtime_definer' AND NOT r.rolcanlogin
        AND NOT r.rolsuper AND NOT r.rolbypassrls
        AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp'] AS safe,
        EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
               WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='school_api'`;
    assert.equal(functions.length, 7);
    assert.ok(functions.every(f => f.safe && !f.public_execute));
    const lookup = await findAuthIdentityByEmail(email);
    assert.equal(lookup?.id, id);
    assert.equal(await findAuthIdentityByEmail(`missing-${email}`), null);
    assert.equal(await findAuthIdentityByEmail("' OR true --"), null);
    const login = async () => {
      let status = 200; let body: any;
      const response: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; }, setHeader() {}, getHeader() { return undefined; } };
      await createAuthLogin({ body: { email, password }, headers: {}, ip: '127.0.0.1' } as any, response);
      return { status, body };
    };
    const active = await login();
    assert.equal(active.status, 200);
    assert.ok(active.body.token);
    assert.equal(active.body.user.passwordHash, undefined);
    await admin.user.update({ where: { id }, data: { isActive: false } });
    assert.equal((await login()).status, 401);
    await admin.user.update({ where: { id }, data: { isActive: true } });

    const hash = randomUUID(); const rotatedHash = randomUUID();
    const session = await createAuthSession(id, hash, new Date(Date.now() + 60_000), null, null);
    assert.equal((await authSessionById(session.id))?.userId, id);
    assert.equal((await authSessionByHash(hash))?.id, session.id);
    assert.equal(await rotateAuthSession(session.id, hash, rotatedHash, new Date(Date.now() + 120_000)), 1);
    assert.equal(await rotateAuthSession(session.id, hash, randomUUID(), new Date()), 0);
    await revokeAuthSession(rotatedHash);
    assert.ok((await authSessionByHash(rotatedHash))?.revokedAt);
    assert.deepEqual(await schoolAccountSummaries([id]), []);
    await withRlsContext(institution.id, async () => {
      assert.equal((await schoolAccountSummaries([id]))[0]?.id, id, 'default raw calls must retain the outer transaction/GUC');
      assert.equal((await schoolInstitution(institution.id))?.id, institution.id);
      assert.equal(await schoolInstitution(randomUUID()), null);
    });
    await assert.rejects(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.current_institution_id', ${randomUUID()}, true)`;
      await createSchoolIdentity(`missing-tenant-${email}`, user.passwordHash, randomUUID(), tx);
    }), denied);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.current_institution_id', ${institution.id}, true)`;
      assert.equal(await lockSchoolInstitution(tx, institution.id), true);
      assert.equal((await schoolAccountSummaries([id], tx))[0]?.id, id);
    });
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.current_institution_id', ${institution.id}, true)`;
      assert.equal(await lockSchoolInstitution(tx, randomUUID()), false);
    });

    let release!: () => void; let acquired!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const transactionA = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.current_institution_id', ${institution.id}, true)`;
      await lockSchoolInstitution(tx, institution.id); acquired(); await gate;
    }, { timeout: 10_000 });
    let transactionB: Promise<unknown> | undefined;
    try {
      await ready;
      let pid = 0; let passed = false;
      transactionB = second.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('app.current_institution_id', ${institution.id}, true)`;
        pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
        await lockSchoolInstitution(tx, institution.id); passed = true;
      }, { timeout: 10_000 });
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        if (pid) waiting = (await admin.$queryRaw<{ waiting: boolean }[]>`SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=${pid}`)[0]?.waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(waiting, true, 'second connection must wait on a real PostgreSQL row lock');
      assert.equal(passed, false);
      release(); await transactionA; await transactionB;
      assert.equal(passed, true);
    } finally { release(); await Promise.allSettled([transactionA, ...(transactionB ? [transactionB] : [])]); }
  } finally {
    await second.$disconnect();
    await admin.auditLog.deleteMany({ where: { actorUserId: id } });
    await admin.userSession.deleteMany({ where: { userId: id } });
    await admin.institutionUser.deleteMany({ where: { userId: id } });
    await admin.user.delete({ where: { id } });
    await admin.staffMember.delete({ where: { id: staff.id } });
  }
});
