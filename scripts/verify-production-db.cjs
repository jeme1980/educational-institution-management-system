const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error('MIGRATION_DATABASE_URL is missing.');
  process.exit(1);
}
const db = new PrismaClient({ datasourceUrl: url });

async function main() {
  const migrationDirectory = path.join(__dirname, '../apps/api/prisma/migrations');
  const expected = fs.readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationDirectory, entry.name, 'migration.sql')))
    .map((entry) => entry.name);
  const applied = await db.$queryRawUnsafe('SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  if (applied.length !== expected.length || expected.some((name) => !applied.some((row) => row.migration_name === name))) {
    throw new Error('Migration count or history is incomplete.');
  }

  for (const roleName of [process.env.RLS_RUNTIME_DB_ROLE || 'school_app', process.env.PLATFORM_RUNTIME_DB_ROLE || 'platform_app']) {
    const rows = await db.$queryRawUnsafe(
      `SELECT r.rolsuper, r.rolbypassrls, r.rolinherit,
        (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS memberships
       FROM pg_roles r WHERE r.rolname = $1`, roleName,
    );
    if (rows.length !== 1 || rows[0].rolsuper || rows[0].rolbypassrls || rows[0].rolinherit || rows[0].memberships !== 0) {
      throw new Error(`${roleName} role safety verification failed.`);
    }
  }

  const platformRole = process.env.PLATFORM_RUNTIME_DB_ROLE || 'platform_app';
  const providerDelete = await db.$queryRawUnsafe("SELECT has_table_privilege($1, 'public.providers', 'DELETE') AS allowed", platformRole);
  if (providerDelete[0].allowed) throw new Error('Provider DELETE privilege is still granted.');
  for (const table of ['students', 'classes', 'topics', 'skills', 'student_enrollments', 'student_guardians', 'staff_developments']) {
    const rows = await db.$queryRawUnsafe('SELECT has_table_privilege($1, $2, $3) AS allowed', platformRole, `public.${table}`, 'SELECT');
    if (rows[0].allowed) throw new Error(`Direct platform SELECT remains on ${table}.`);
  }
  for (const signature of ['platform_api.platform_get_institution_usage(uuid)', 'platform_api.platform_reference_dependency_counts(text, uuid)']) {
    const rows = await db.$queryRawUnsafe('SELECT has_function_privilege($1, $2, $3) AS allowed', platformRole, signature, 'EXECUTE');
    if (!rows[0].allowed) throw new Error('Platform Metrics function permission is missing.');
  }
  console.log(`${applied.length}/${expected.length} migrations applied; restricted roles, Provider DELETE, seven direct SELECT grants, and Metrics function permissions verified.`);
}

main().catch(() => {
  console.error('Production database verification failed. Check migration history, role attributes, and ACL state.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
