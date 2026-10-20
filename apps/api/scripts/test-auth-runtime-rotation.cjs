const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

// Explicit disposable target only; never read local .env or accept the source DB.
const target = new URL(process.env.TEST_ADMIN_DATABASE_URL || 'postgresql://invalid');
if (target.hostname !== '127.0.0.1' || Number(target.port) < 55006 || !/^rotation_test_[a-z0-9_]+$/.test(target.pathname.slice(1))) {
  throw new Error('A guarded disposable rotation_test_* database on 127.0.0.1:>=55006 is required.');
}
const root = path.resolve(__dirname, '../../..');
const admin = new PrismaClient({ datasourceUrl: target.href });
const secret = () => randomBytes(32).toString('base64url') + "'\\$$rotation-é";
const old = process.env.AUTH_RUNTIME_DB_PASSWORD;
if (!old || !process.env.PSQL_PATH) throw new Error('Synthetic initial password and PSQL_PATH required.');
function installer(password, rotate = true, extra = []) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'install-school-runtime-api.ps1'), ...(rotate ? ['-RotateAuthPassword'] : []), ...extra], {
    cwd: root, env: { ...process.env, MIGRATION_DATABASE_URL: target.href, AUTH_RUNTIME_DB_PASSWORD: password }, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  for (const value of [old, password, decodeURIComponent(target.password)].filter(Boolean)) assert.ok(!output.includes(value), 'Secrets must not appear in installer output');
  return result.status;
}
async function connects(password) {
  const url = new URL(target); url.username = 'school_auth_app'; url.password = password;
  const db = new PrismaClient({ datasourceUrl: url.href });
  try { const [identity] = await db.$queryRawUnsafe('SELECT current_user AS role,current_database() AS database'); return identity.role === 'school_auth_app' && identity.database === target.pathname.slice(1); }
  catch { return false; } finally { await db.$disconnect(); }
}
async function snapshot() {
  // Capture all managed roles and all non-system object ACLs, including columns,
  // default privileges and ownership. Password verifiers are deliberately absent.
  return {
    roles: await admin.$queryRawUnsafe("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil::text,rolconfig FROM pg_roles WHERE rolname IN ('school_auth_app','school_app','platform_app','school_runtime_definer') ORDER BY 1"),
    memberships: await admin.$queryRawUnsafe('SELECT pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1,2'),
    schemas: await admin.$queryRawUnsafe("SELECT nspname,pg_get_userbyid(nspowner) owner,nspacl::text FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY 1"),
    tables: await admin.$queryRawUnsafe("SELECT n.nspname,c.relname,c.relkind::text,pg_get_userbyid(c.relowner) owner,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY 1,2,3"),
    columns: await admin.$queryRawUnsafe("SELECT n.nspname,c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY 1,2,3"),
    functions: await admin.$queryRawUnsafe("SELECT n.nspname,p.proname,oidvectortypes(p.proargtypes) args,pg_get_userbyid(p.proowner) owner,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY 1,2,3"),
    defaults: await admin.$queryRawUnsafe('SELECT pg_get_userbyid(defaclrole) role,defaclnamespace::regnamespace::text schema,defaclobjtype::text,defaclacl::text FROM pg_default_acl ORDER BY 1,2,3'),
  };
}
async function boundaries(password) {
  const url = new URL(target); url.username = 'school_auth_app'; url.password = password;
  const db = new PrismaClient({ datasourceUrl: url.href });
  try {
    for (const table of ['users', 'user_sessions', 'institutions']) {
      for (const sql of [`SELECT id FROM public.${table} WHERE false`, `UPDATE public.${table} SET id=id WHERE false`, `DELETE FROM public.${table} WHERE false`, `INSERT INTO public.${table}(id) SELECT gen_random_uuid() WHERE false`]) {
        await assert.rejects(() => db.$queryRawUnsafe(sql), error => error?.meta?.code === '42501');
      }
    }
    const rows = await db.$queryRawUnsafe('SELECT id FROM auth_api.auth_login_identity_email($1::text)', randomUUID() + '@example.invalid');
    assert.equal(rows.length, 0);
  } finally { await db.$disconnect(); }
}

test('canonical auth credential lifecycle preserves all ACLs and fails closed', async () => {
  try {
    const before = await snapshot();
    assert.equal(await connects(old), true, 'Initial credential connects');
    const second = secret(), third = secret();
    assert.equal(installer(second), 0, 'First rotation succeeds');
    assert.equal(await connects(old), false, 'Old credential rejected');
    assert.equal(await connects(second), true, 'Second credential accepted');
    assert.deepEqual(await snapshot(), before, 'ACLs, role attributes, memberships and ownership unchanged');
    await boundaries(second);
    assert.equal(installer(old, false), 0, 'Ordinary installer succeeds without rotation');
    assert.equal(await connects(second), true, 'Ordinary installer preserves current credential');
    assert.equal(await connects(old), false);
    assert.deepEqual(await snapshot(), before);
    assert.equal(installer(third), 0, 'Repeated rotation succeeds');
    assert.equal(await connects(second), false);
    assert.equal(await connects(third), true);
    assert.deepEqual(await snapshot(), before);
    await boundaries(third);
    assert.notEqual(installer(''), 0, 'Missing secret fails');
    assert.notEqual(installer(secret(), true, ['-RoleName', 'school_app']), 0, 'Caller cannot choose another role');
    await admin.$executeRawUnsafe('ALTER ROLE school_auth_app RENAME TO rotation_auth_absent');
    try { assert.notEqual(installer(secret()), 0, 'Missing exact target fails'); }
    finally { await admin.$executeRawUnsafe('ALTER ROLE rotation_auth_absent RENAME TO school_auth_app'); }
    await admin.$executeRawUnsafe('ALTER ROLE school_auth_app CREATEDB');
    try { assert.notEqual(installer(secret()), 0, 'Unsafe role fails before changing credential'); }
    finally { await admin.$executeRawUnsafe('ALTER ROLE school_auth_app NOCREATEDB'); }
    assert.equal(await connects(third), true, 'Negative tests preserve credential');
    assert.deepEqual(await snapshot(), before);
    if (process.env.ROTATION_POSTGRES_LOG_PATH) {
      const log = fs.readFileSync(process.env.ROTATION_POSTGRES_LOG_PATH, 'utf8');
      for (const password of [old, second, third]) {
        assert.ok(!log.includes(password), 'PostgreSQL log must not contain plaintext passwords');
        assert.ok(!log.includes(password.replaceAll("'", "''")), 'SQL-escaped plaintext must not be logged');
      }
    }
    console.log('ROTATION_1=PASS; ROTATION_2=PASS; OLD_CREDENTIALS=REJECTED; ACL_DELTA=NONE; DIRECT_CRUD=DENIED; AUTH_CAPABILITY=PASS; NEGATIVES=PASS');
  } finally { await admin.$disconnect(); }
});
