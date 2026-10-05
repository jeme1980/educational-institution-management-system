import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { platformPrisma } from '../db/platform-prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { getInstitutionUsage, getReferenceDependencyCounts } from '../db/platform-metrics.repository';
import { getInstitution, updatePlan } from '../controllers/platform.controller';
import { createLocalAccessToken } from '../middleware/auth';

const invoke = async (handler: any, request: any) => {
  let statusCode = 200;
  let body: any;
  const response: any = {
    status: (code: number) => { statusCode = code; return response; },
    json: (value: any) => { body = value; return response; },
  };
  await handler(request, response);
  return { statusCode, body };
};

test('platform metrics functions have a restricted owner and execute grants', async () => {
  const [role] = await platformPrisma.$queryRaw<{
    rolcanlogin: boolean; rolinherit: boolean; rolsuper: boolean; rolbypassrls: boolean;
    rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean;
  }[]>`
    SELECT rolcanlogin, rolinherit, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
    FROM pg_roles WHERE rolname = 'platform_metrics_definer'
  `;
  assert.deepEqual(role, {
    rolcanlogin: false, rolinherit: false, rolsuper: false, rolbypassrls: false,
    rolcreatedb: false, rolcreaterole: false, rolreplication: false,
  });
  const membership = await platformPrisma.$queryRaw<{ inherited_roles: bigint; members: bigint }[]>`
    SELECT
      (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
       WHERE r.rolname = 'platform_metrics_definer') AS inherited_roles,
      (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
       WHERE r.rolname = 'platform_metrics_definer') AS members
  `;
  assert.deepEqual(membership[0], { inherited_roles: 0n, members: 0n });
  const grants = await platformPrisma.$queryRaw<{ relname: string; privilege_type: string }[]>`
    SELECT c.relname, a.privilege_type
    FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE c.relnamespace = 'public'::regnamespace AND r.rolname = 'platform_metrics_definer'
    ORDER BY c.relname, a.privilege_type
  `;
  assert.deepEqual(grants.map((grant) => grant.relname), [
    'classes', 'institution_users', 'institutions', 'skills', 'staff_members',
    'student_enrollments', 'student_guardians', 'students', 'topics', 'towns',
  ]);
  assert.ok(grants.every((grant) => grant.privilege_type === 'SELECT'));
  const functions = await platformPrisma.$queryRaw<{
    proname: string; owner: string; prosecdef: boolean; proconfig: string[];
    platform_execute: boolean; school_execute: boolean; public_execute: boolean;
  }[]>`
    SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
      has_function_privilege('platform_app', p.oid, 'EXECUTE') AS platform_execute,
      has_function_privilege('school_app', p.oid, 'EXECUTE') AS school_execute,
      EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_execute
    FROM pg_proc p WHERE p.pronamespace = 'platform_api'::regnamespace ORDER BY p.proname
  `;
  assert.deepEqual(functions.map((item) => item.proname), [
    'platform_get_institution_usage', 'platform_reference_dependency_counts',
  ]);
  for (const item of functions) {
    assert.equal(item.owner, 'platform_metrics_definer');
    assert.equal(item.prosecdef, true);
    assert.deepEqual(item.proconfig, ['search_path=pg_catalog']);
    assert.equal(item.platform_execute, true);
    assert.equal(item.school_execute, false);
    assert.equal(item.public_execute, false);
  }
});

test('platform metrics return non-zero isolated usage and cross-tenant dependency counts without GUC leakage', async () => {
  const base = await admin.institution.findFirstOrThrow();
  const studentStatus = await admin.studentStatus.findFirstOrThrow();
  const suffix = Date.now().toString().slice(-8);
  const town = await admin.town.create({ data: { nameAr: `Metrics ${suffix}`, regionId: base.regionId } });
  const institutionIds: string[] = [];
  const userIds: string[] = [];
  let planId = '';
  try {
    const institutions = await Promise.all(['A', 'B'].map((label) => admin.institution.create({
      data: {
        schoolCode: `PM${suffix}${label}`, slug: `platform-metrics-${suffix}-${label.toLowerCase()}`,
        nameAr: `Metrics ${label}`, typeId: base.typeId, regionId: base.regionId,
        statusId: base.statusId, defaultLanguageId: base.defaultLanguageId,
      },
    })));
    institutionIds.push(...institutions.map((item) => item.id));
    const [a, b] = institutions;
    assert.ok(a && b);
    await admin.student.createMany({ data: [
      { institutionId: a.id, studentStatusId: studentStatus.id, nationalId: `${suffix}01`, firstNameAr: 'A1', lastNameAr: 'Test', townId: town.id, isActive: true },
      { institutionId: a.id, studentStatusId: studentStatus.id, nationalId: `${suffix}02`, firstNameAr: 'A2', lastNameAr: 'Test', townId: town.id, isActive: true },
      { institutionId: a.id, studentStatusId: studentStatus.id, nationalId: `${suffix}03`, firstNameAr: 'A3', lastNameAr: 'Test', isActive: false },
      { institutionId: b.id, studentStatusId: studentStatus.id, nationalId: `${suffix}04`, firstNameAr: 'B1', lastNameAr: 'Test', townId: town.id, isActive: true },
    ] });
    const staffA = await admin.staffMember.create({ data: { institutionId: a.id, firstNameAr: 'A', familyNameAr: 'Staff' } });
    await admin.staffMember.createMany({ data: [
      { institutionId: a.id, firstNameAr: 'Archived', familyNameAr: 'Staff', archivedAt: new Date() },
      { institutionId: b.id, firstNameAr: 'B1', familyNameAr: 'Staff' },
      { institutionId: b.id, firstNameAr: 'B2', familyNameAr: 'Staff' },
    ] });
    const user = await admin.user.create({ data: {
      email: `platform-metrics-${suffix}@example.com`, normalizedEmail: `platform-metrics-${suffix}@example.com`, passwordHash: 'fixture-only',
    } });
    userIds.push(user.id);
    await admin.institutionUser.create({ data: { institutionId: a.id, userId: user.id, staffMemberId: staffA.id, isActive: true } });

    assert.deepEqual(await getInstitutionUsage(a.id), { students: 2, staff: 1, users: 1 });
    assert.deepEqual(await getInstitutionUsage(b.id), { students: 1, staff: 2, users: 0 });
    const detailA = await invoke(getInstitution, { params: { id: a.id } });
    const detailB = await invoke(getInstitution, { params: { id: b.id } });
    assert.equal(detailA.statusCode, 200);
    assert.equal(detailB.statusCode, 200);
    assert.deepEqual(detailA.body.subscriptionState.usage, { students: 2, staff: 1, users: 1 });
    assert.deepEqual(detailB.body.subscriptionState.usage, { students: 1, staff: 2, users: 0 });

    await platformPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_institution_id', ${b.id}, true)`;
      assert.deepEqual(await getInstitutionUsage(a.id, tx), { students: 2, staff: 1, users: 1 });
      const [context] = await tx.$queryRaw<{ value: string }[]>`
        SELECT current_setting('app.current_institution_id', true) AS value
      `;
      assert.equal(context?.value, b.id);
      await tx.$executeRaw`SAVEPOINT before_metrics_error`;
      await assert.rejects(() => getInstitutionUsage(randomUUID(), tx));
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT before_metrics_error`;
      const [afterError] = await tx.$queryRaw<{ value: string }[]>`
        SELECT current_setting('app.current_institution_id', true) AS value
      `;
      assert.equal(afterError?.value, b.id);
    });

    const dependencies = await getReferenceDependencyCounts('towns', town.id);
    assert.deepEqual(dependencies, [
      { type: 'institutions', count: 0 }, { type: 'students', count: 3 },
    ]);
    await assert.rejects(
      () => getReferenceDependencyCounts('unknown' as any, town.id),
      (error: any) => String(error?.meta?.message || error?.message).includes('Unsupported reference dependency request'),
    );

    const plan = await admin.plan.create({ data: { code: `PM_${suffix}`, nameAr: 'Metrics plan', maxStudents: 10, maxStaff: 10, maxUsers: 10 } });
    planId = plan.id;
    await admin.institutionSubscription.createMany({ data: [
      { institutionId: a.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() },
      { institutionId: b.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() },
    ] });
    const actor = await admin.user.findFirstOrThrow({ where: { isPlatformAdmin: true } });
    const server = createServer(app);
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const token = await createLocalAccessToken(actor.id, actor.email, actor.securityStamp);
      const headers = { authorization: `Bearer ${token}` };
      const detailResponse = await fetch(`${baseUrl}/api/platform/institutions/${a.id}/subscription`, { headers });
      assert.equal(detailResponse.status, 200);
      const detail = await detailResponse.json() as any;
      assert.deepEqual(detail.subscriptionState.usage, { students: 2, staff: 1, users: 1 });
      const deleteResponse = await fetch(`${baseUrl}/api/platform/reference-data/towns/${town.id}`, { method: 'DELETE', headers });
      assert.equal(deleteResponse.status, 409);
      const conflict = await deleteResponse.json() as any;
      assert.equal(conflict.code, 'REFERENCE_IN_USE');
      assert.deepEqual(conflict.dependencies, [{ type: 'students', count: 3 }]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    for (const [field, usage] of [['maxStudents', 2], ['maxStaff', 2], ['maxUsers', 1]] as const) {
      const result = await invoke(updatePlan, { params: { id: plan.id }, body: { [field]: 0 }, user: { uid: actor.id } });
      assert.equal(result.statusCode, 409);
      assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
      assert.equal(result.body.currentUsage, usage);
    }
  } finally {
    if (planId) {
      await admin.platformAuditLog.deleteMany({ where: { entityId: planId } });
      await admin.institutionSubscription.deleteMany({ where: { planId } });
      await admin.plan.delete({ where: { id: planId } });
    }
    if (institutionIds.length) {
      await admin.institutionUser.deleteMany({ where: { institutionId: { in: institutionIds } } });
      await admin.student.deleteMany({ where: { institutionId: { in: institutionIds } } });
      await admin.staffMember.deleteMany({ where: { institutionId: { in: institutionIds } } });
      await admin.institution.deleteMany({ where: { id: { in: institutionIds } } });
    }
    if (userIds.length) await admin.user.deleteMany({ where: { id: { in: userIds } } });
    await admin.town.delete({ where: { id: town.id } });
  }
});
