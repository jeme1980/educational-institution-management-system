const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const contracts = require('./runtime-function-contracts.cjs');
const mode = process.argv[process.argv.indexOf('--mode') + 1];
if (!['pre-cutover','post-cutover'].includes(mode) || process.argv.length !== 4 || process.argv[2] !== '--mode') {
  console.error('Explicit --mode pre-cutover|post-cutover is required.'); process.exit(1);
}
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error('MIGRATION_DATABASE_URL is missing.');
  process.exit(1);
}
const db = new PrismaClient({ datasourceUrl: url });

// Ignore SQL formatting, but preserve case and whitespace inside quoted output names.
const normalize = value => {
  let quoted=false, result='';
  for (const char of value) {
    if (char==='"') quoted=!quoted;
    else if (quoted || !/\s/.test(char)) result+=char;
  }
  return result;
};
async function verifyRuntimeBoundary(db, mode) {
  for (const role of ['school_app','school_auth_app']) {
    const [state] = await db.$queryRawUnsafe(`SELECT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE proowner=r.oid) AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid) AS safe FROM pg_roles r WHERE rolname=$1`,role);
    if (!state?.safe) throw Error('Unsafe runtime role');
    if (role==='school_auth_app') {
      const [unexpected]=await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND (has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND n.nspname NOT IN ('auth_api','pg_catalog','information_schema') AND has_function_privilege($1,p.oid,'EXECUTE')) AS allowed`,role);
      if (unexpected.allowed) throw Error('Unexpected authentication runtime capability');
    }
    const pending = [];
    for (const table of ['users','user_sessions','institutions']) {
      const [access] = await db.$queryRawUnsafe(`SELECT has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege($1,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$2`,role,table);
      if (!access) throw Error('Missing global table');
      if (access.allowed) pending.push(table);
    }
    if (pending.length && (role==='school_auth_app' || mode==='post-cutover')) throw Error('Forbidden global table/column privileges');
    if (pending.length) console.log('PENDING_LEGACY_REMEDIATION=school_app:'+pending.join(','));
    else console.log('PENDING_LEGACY_REMEDIATION='+role+':NONE');
    for (const schema of ['public','school_api','auth_api']) {
      const [access] = await db.$queryRawUnsafe("SELECT has_schema_privilege($1,$2,'CREATE') AS creatable",role,schema);
      if (access.creatable) throw Error('Runtime schema CREATE');
    }
  }
  const functions = await db.$queryRawUnsafe(`SELECT p.oid::text,n.nspname AS schema,p.proname AS name,oidvectortypes(p.proargtypes) AS args,pg_get_function_result(p.oid) AS result,p.prosecdef,p.proconfig,r.rolname AS owner,
    NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS safe_owner,
    EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
    EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a JOIN pg_roles gr ON gr.oid=a.grantee WHERE a.privilege_type='EXECUTE' AND (gr.rolname NOT IN ('school_runtime_definer',CASE WHEN n.nspname='auth_api' THEN 'school_auth_app' ELSE 'school_app' END) OR (gr.rolname<>'school_runtime_definer' AND a.is_grantable))) AS unexpected
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname IN ('school_api','auth_api')`);
  if (functions.length!==contracts.length) throw Error('Unexpected function/overload count');
  for (const expected of contracts) {
    const actual=functions.find(f=>f.schema===expected.schema && f.name===expected.name && normalize(f.args)===normalize(expected.args));
    if (!actual || normalize(actual.result)!==normalize(expected.result) || !actual.prosecdef || actual.owner!=='school_runtime_definer' || !actual.safe_owner || actual.public_execute || actual.unexpected || actual.proconfig?.length!==1 || actual.proconfig[0]!=='search_path=pg_catalog, pg_temp') throw Error('Function signature/result/owner/ACL mismatch');
    for (const role of ['school_app','school_auth_app','platform_app']) {
      const [access]=await db.$queryRawUnsafe("SELECT has_function_privilege($1,$2::oid,'EXECUTE') AS allowed",role,actual.oid);
      if (access.allowed !== (role===expected.role)) throw Error('Wrong effective EXECUTE role');
    }
  }
  for (const schema of ['public','school_api','auth_api']) {
    const [unsafe]=await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM pg_namespace n, LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname=$1 AND a.grantee=0 AND a.privilege_type='CREATE') AS allowed`,schema);
    if (unsafe.allowed) throw Error('PUBLIC schema CREATE');
  }
  for (const [schema,role] of [['school_api','school_app'],['auth_api','school_auth_app']]) {
    const [access]=await db.$queryRawUnsafe("SELECT has_schema_privilege($1,$2,'USAGE') AS allowed",role,schema);
    if (!access.allowed) throw Error('Missing schema USAGE');
  }
  const defaults=await db.$queryRawUnsafe(`SELECT r.rolname, EXISTS(SELECT 1 FROM aclexplode(COALESCE((SELECT d.defaclacl FROM pg_default_acl d WHERE d.defaclrole=r.oid AND d.defaclnamespace=0 AND d.defaclobjtype='f'),acldefault('f',r.oid))) a WHERE a.grantee<>r.oid AND a.privilege_type='EXECUTE') OR EXISTS(SELECT 1 FROM pg_default_acl d,LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole=r.oid AND d.defaclobjtype='f' AND d.defaclnamespace<>0 AND a.privilege_type='EXECUTE' AND a.grantee<>r.oid) AS unsafe FROM pg_roles r WHERE r.rolname IN (current_user,'school_runtime_definer')`);
  if (defaults.length!==2 || defaults.some(d=>d.unsafe)) throw Error('Unsafe function default privileges');
}

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
  await verifyRuntimeBoundary(db, mode);
  console.log(`POSTGRES_SECURITY_VERIFICATION=${mode === 'post-cutover' ? 'HARDENED' : 'PRE_CUTOVER_ONLY'}`);

}

main().catch(() => {
  console.error('Production database verification failed. Check migration history, role attributes, and ACL state.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
