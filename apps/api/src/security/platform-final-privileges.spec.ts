import assert from 'node:assert/strict';
import test from 'node:test';
import { platformPrisma } from '../db/platform-prisma';

const tenantTables = [
  'students', 'classes', 'topics', 'skills', 'student_enrollments',
  'student_guardians', 'staff_developments',
] as const;

test('platform_app final role and table ACL contract', async () => {
  const [role] = await platformPrisma.$queryRaw<{
    rolcanlogin: boolean; rolinherit: boolean; rolsuper: boolean; rolbypassrls: boolean;
    rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean;
    memberships: bigint;
  }[]>`
    SELECT r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
      r.rolcreaterole, r.rolreplication,
      (SELECT count(*) FROM pg_auth_members m WHERE m.member = r.oid) AS memberships
    FROM pg_roles r WHERE r.rolname = 'platform_app'
  `;
  assert.deepEqual(role, {
    rolcanlogin: true, rolinherit: false, rolsuper: false, rolbypassrls: false,
    rolcreatedb: false, rolcreaterole: false, rolreplication: false,
    memberships: 0n,
  });
  for (const table of tenantTables) {
    const [privileges] = await platformPrisma.$queryRawUnsafe<{
      can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean;
    }[]>(`
      SELECT has_table_privilege(current_user, 'public.${table}', 'SELECT') AS can_select,
        has_table_privilege(current_user, 'public.${table}', 'INSERT') AS can_insert,
        has_table_privilege(current_user, 'public.${table}', 'UPDATE') AS can_update,
        has_table_privilege(current_user, 'public.${table}', 'DELETE') AS can_delete
    `);
    assert.deepEqual(privileges, {
      can_select: false, can_insert: false, can_update: false, can_delete: false,
    }, `platform_app ACL for ${table}`);
  }
  const [reference] = await platformPrisma.$queryRaw<{
    provider_select: boolean; provider_insert: boolean; provider_update: boolean;
    provider_delete: boolean; region_insert: boolean;
  }[]>`
    SELECT has_table_privilege(current_user, 'public.providers', 'SELECT') AS provider_select,
      has_table_privilege(current_user, 'public.providers', 'INSERT') AS provider_insert,
      has_table_privilege(current_user, 'public.providers', 'UPDATE') AS provider_update,
      has_table_privilege(current_user, 'public.providers', 'DELETE') AS provider_delete,
      has_table_privilege(current_user, 'public.regions', 'INSERT') AS region_insert
  `;
  assert.deepEqual(reference, {
    provider_select: true, provider_insert: true, provider_update: true,
    provider_delete: false, region_insert: true,
  });
});

test('platform_app direct tenant reads are denied by PostgreSQL', async () => {
  for (const table of ['students', 'classes', 'student_enrollments', 'staff_developments']) {
    await assert.rejects(
      () => platformPrisma.$queryRawUnsafe(`SELECT * FROM public.${table} LIMIT 1`),
      (error: any) => String(error?.meta?.message || error?.message).toLowerCase().includes('permission denied'),
      `direct SELECT on ${table} must fail with a permission error`,
    );
  }
});
