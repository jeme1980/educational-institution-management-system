import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import app from '../server';
import { platformPrisma } from '../db/platform-prisma';
import { inspectRuntimeDatabaseRole } from '../services/runtime-database-role.service';
import { assignPlatformSubscription, transitionPlatformSubscription } from '../services/platform-subscription.service';
import { getInitialAdminStatus, provisionInitialSchoolAdmin, reissueInitialAdminSetup } from '../services/school-onboarding.service';
import { completeAccountSetup } from '../controllers/account-setup.controller';
import { hashPassword } from './password';
import { setupTokenHash } from '../services/account-setup.service';

type PrivilegeRow = {
  schema_create: boolean;
  owns_table: boolean;
  inherited_roles: bigint;
  student_select: boolean;
  student_insert: boolean;
  attendance_select: boolean;
  exam_select: boolean;
  result_select: boolean;
  medical_select: boolean;
};

const invoke = async (handler: any, body: any) => {
  let statusCode = 200;
  let responseBody: any;
  const response: any = {
    status: (code: number) => { statusCode = code; return response; },
    json: (value: any) => { responseBody = value; return response; },
  };
  await handler({ body, headers: {}, ip: '127.0.0.1' } as any, response);
  return { statusCode, body: responseBody };
};

const tokenFromSetupUrl = (url: string) => decodeURIComponent(new URL(url).searchParams.get('token') || '');

async function assertDatabaseDenied(operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation, (error: any) => {
    const text = `${error?.message || ''} ${error?.meta?.message || ''}`.toLowerCase();
    return text.includes('permission denied') || error?.code === 'P2010';
  });
}

test('Phase 10C-2: restricted platform role preserves platform workflows and denies school operations', async () => {
  assert.ok(process.env['PLATFORM_DATABASE_URL'], 'PLATFORM_DATABASE_URL must explicitly target the restricted role for this test.');
  const adminUrl = process.env['MIGRATION_DATABASE_URL'] || process.env['DATABASE_URL'];
  assert.ok(adminUrl, 'MIGRATION_DATABASE_URL or DATABASE_URL is required for fixture administration.');
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  const suffix = `${Date.now()}`.slice(-8);
  const role = await inspectRuntimeDatabaseRole(platformPrisma);
  assert.equal(role.safeForRuntime, true);
  assert.equal(role.superuser, false);
  assert.equal(role.bypassRls, false);
  assert.equal(role.createDatabase, false);
  assert.equal(role.createRole, false);
  assert.equal(role.replication, false);

  const privilegeRows = await platformPrisma.$queryRawUnsafe<PrivilegeRow[]>(`
    SELECT
      has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
      EXISTS (
        SELECT 1 FROM pg_class item JOIN pg_roles owner ON owner.oid = item.relowner
        WHERE item.relnamespace = 'public'::regnamespace AND owner.rolname = current_user
      ) AS owns_table,
      (SELECT COUNT(*) FROM pg_auth_members membership JOIN pg_roles member_role ON member_role.oid = membership.member WHERE member_role.rolname = current_user) AS inherited_roles,
      has_table_privilege(current_user, 'public.students', 'SELECT') AS student_select,
      has_table_privilege(current_user, 'public.students', 'INSERT') AS student_insert,
      has_table_privilege(current_user, 'public.student_attendance', 'SELECT') AS attendance_select,
      has_table_privilege(current_user, 'public.exams', 'SELECT') AS exam_select,
      has_table_privilege(current_user, 'public.student_exam_results', 'SELECT') AS result_select,
      has_table_privilege(current_user, 'public.student_medical_profiles', 'SELECT') AS medical_select
  `);
  const privileges = privilegeRows[0];
  assert.ok(privileges);
  assert.equal(privileges.schema_create, false);
  assert.equal(privileges.owns_table, false);
  assert.equal(Number(privileges.inherited_roles), 0);
  assert.equal(privileges.student_select, false);
  assert.equal(privileges.student_insert, false);
  assert.equal(privileges.attendance_select, false);
  assert.equal(privileges.exam_select, false);
  assert.equal(privileges.result_select, false);
  assert.equal(privileges.medical_select, false);

  await assertDatabaseDenied(() => platformPrisma.$queryRawUnsafe('SELECT * FROM public.students LIMIT 1'));
  await assertDatabaseDenied(() => platformPrisma.$executeRawUnsafe('INSERT INTO public.students DEFAULT VALUES'));
  await assertDatabaseDenied(() => platformPrisma.$queryRawUnsafe('SELECT * FROM public.student_attendance LIMIT 1'));
  await assertDatabaseDenied(() => platformPrisma.$queryRawUnsafe('SELECT * FROM public.exams LIMIT 1'));
  await assertDatabaseDenied(() => platformPrisma.$queryRawUnsafe('SELECT * FROM public.student_exam_results LIMIT 1'));
  await assertDatabaseDenied(() => platformPrisma.$queryRawUnsafe('SELECT * FROM public.student_medical_profiles LIMIT 1'));
  await assertDatabaseDenied(() => platformPrisma.$executeRawUnsafe('UPDATE public.staff_members SET "updatedAt" = NOW() WHERE FALSE'));
  await assertDatabaseDenied(() => platformPrisma.$executeRawUnsafe('DELETE FROM public.student_attendance WHERE FALSE'));

  const base = await admin.institution.findFirstOrThrow();
  const platformActor = await admin.user.create({ data: {
    email: `platform-10c2-${suffix}@test.local`,
    normalizedEmail: `platform-10c2-${suffix}@test.local`,
    passwordHash: await hashPassword('PlatformTest@2026!'),
    isActive: true,
    isPlatformAdmin: true,
  } });
  let institutionId = '';
  let planId = '';
  let provisioned: any;
  const server = createServer(app);
  try {
    assert.ok(await platformPrisma.user.findUnique({ where: { id: platformActor.id } }));
    const institution = await platformPrisma.institution.create({ data: {
      schoolCode: `10C2${suffix}`.slice(0, 20),
      slug: `phase-10c2-${suffix}`,
      nameAr: 'Phase 10C-2 institution',
      typeId: base.typeId,
      regionId: base.regionId,
      townId: base.townId,
      statusId: base.statusId,
      defaultLanguageId: base.defaultLanguageId,
    } });
    institutionId = institution.id;
    const updatedInstitution = await platformPrisma.institution.update({ where: { id: institution.id }, data: { nameAr: 'Phase 10C-2 updated' } });
    assert.equal(updatedInstitution.nameAr, 'Phase 10C-2 updated');

    const plan = await platformPrisma.plan.create({ data: { code: `10C2_${suffix}`, nameAr: 'Phase 10C-2 plan', maxStudents: 10 } });
    planId = plan.id;
    assert.equal((await platformPrisma.plan.update({ where: { id: plan.id }, data: { maxStudents: 12 } })).maxStudents, 12);
    assert.equal((await assignPlatformSubscription({ institutionId, planId, actorUserId: platformActor.id })).status, 'ACTIVE');
    assert.equal((await transitionPlatformSubscription({ institutionId, status: 'SUSPENDED', actorUserId: platformActor.id })).status, 'SUSPENDED');
    assert.ok(await platformPrisma.platformAuditLog.findFirst({ where: { targetInstitutionId: institutionId } }));

    provisioned = await provisionInitialSchoolAdmin({
      institutionId,
      email: `admin-10c2-${suffix}@test.local`,
      firstNameAr: 'مدير',
      familyNameAr: 'الاختبار',
      nationalId: `${suffix}12`.slice(-10),
      actorUserId: platformActor.id,
    });
    assert.equal((await getInitialAdminStatus(institutionId)).status, 'PENDING_SETUP');
    const reissued = await reissueInitialAdminSetup({ institutionId, actorUserId: platformActor.id });
    assert.ok(reissued.setup.setupUrl);
    const rawSetupToken = tokenFromSetupUrl(reissued.setup.setupUrl!);
    const storedSetupToken = await platformPrisma.userAccountSetupToken.findUnique({
      where: { tokenHash: setupTokenHash(rawSetupToken) },
      include: { user: { include: { institutionUsers: true } } },
    });
    assert.ok(storedSetupToken);
    assert.equal(storedSetupToken.usedAt, null);
    assert.ok(storedSetupToken.user.institutionUsers.length);
    assert.equal(storedSetupToken.user.mustChangePassword, true);
    const setup = await invoke(completeAccountSetup, {
      token: rawSetupToken,
      password: 'SchoolTest@2026!',
      confirmPassword: 'SchoolTest@2026!',
    });
    assert.equal(setup.statusCode, 200, JSON.stringify(setup.body));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: platformActor.email, password: 'PlatformTest@2026!' }),
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json() as any;
    const headers = { authorization: `Bearer ${loginBody.token}` };
    assert.equal((await fetch(`${baseUrl}/api/platform/institutions`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/ready`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/students`, { headers })).status, 403);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const userIds = [platformActor.id, provisioned?.userId].filter(Boolean);
    await admin.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await admin.userAccountSetupToken.deleteMany({ where: { userId: { in: userIds } } });
    if (institutionId) {
      await admin.auditLog.deleteMany({ where: { institutionId } });
      await admin.platformAuditLog.deleteMany({ where: { targetInstitutionId: institutionId } });
      await admin.institutionUserRole.deleteMany({ where: { institutionId } });
      await admin.rolePermission.deleteMany({ where: { institutionId } });
      await admin.institutionUser.deleteMany({ where: { institutionId } });
      await admin.staffMember.deleteMany({ where: { institutionId } });
      await admin.role.deleteMany({ where: { institutionId } });
      await admin.institutionSubscription.deleteMany({ where: { institutionId } });
      await admin.institution.deleteMany({ where: { id: institutionId } });
    }
    if (planId) await admin.plan.deleteMany({ where: { id: planId } });
    await admin.user.deleteMany({ where: { id: { in: userIds } } });
    await admin.$disconnect();
  }
});
