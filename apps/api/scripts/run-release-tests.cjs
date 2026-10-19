'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const dist = path.join(root, 'apps/api/dist');
const requiredBoundaryFiles = [
  'security/auth-runtime-boundary.spec.js', // Three boundary tests.
  'security/school-runtime-api.spec.js', // One boundary/locking test.
];

function assertIsolatedEnvironment() {
  if (process.env.NODE_ENV !== 'test') throw new Error('NODE_ENV=test is required.');
  const required = ['DATABASE_URL', 'TEST_ADMIN_DATABASE_URL', 'MIGRATION_DATABASE_URL',
    'RLS_RUNTIME_DATABASE_URL', 'AUTH_RUNTIME_DATABASE_URL', 'PLATFORM_DATABASE_URL'];
  for (const name of required) {
    if (!process.env[name]) throw new Error(`${name} must explicitly target the isolated test database.`);
  }
  if (!process.env.PSQL_PATH) throw new Error('PSQL_PATH must identify the approved PostgreSQL client.');
  let target;
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || !/(?:DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)$/.test(name)) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error(`${name} is not a valid isolated database URL.`); }
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || Number(url.port) < 55005 || Number(url.port) > 65535
      || !database || database.toLowerCase() === 'school' || database.includes('/')) {
      throw new Error(`${name} must target a non-school database on 127.0.0.1:55005 or higher.`);
    }
    const current = `${url.hostname}:${url.port}/${database}`;
    if (target && current !== target) throw new Error('All database URLs must target the same isolated database.');
    target = current;
  }
  for (const [name, role] of [['RLS_RUNTIME_DATABASE_URL', 'school_app'],
    ['AUTH_RUNTIME_DATABASE_URL', 'school_auth_app'], ['PLATFORM_DATABASE_URL', 'platform_app']]) {
    if (decodeURIComponent(new URL(process.env[name]).username) !== role) {
      throw new Error(`${name} must use ${role}.`);
    }
  }
}

function discover(directory, relative = '') {
  const tests = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Compiled release tests must not contain symbolic links.');
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) tests.push(...discover(absolute, name));
    else if (entry.isFile() && /\.(spec|test)\.js$/.test(entry.name)) tests.push(name);
  }
  return tests;
}

try {
  if (process.argv.length !== 2) throw new Error('The release runner accepts no file arguments.');
  assertIsolatedEnvironment();
  if (!fs.lstatSync(dist).isDirectory()) throw new Error('Build the API before running release tests.');
  const tests = discover(dist).sort(); // UTF-16 lexical order; independent of OS locale.
  if (!tests.length) throw new Error('No compiled API release tests discovered.');
  if (new Set(tests).size !== tests.length) throw new Error('Duplicate release test files discovered.');
  for (const required of requiredBoundaryFiles) {
    if (!tests.includes(required)) throw new Error(`Required boundary test file missing: ${required}`);
  }
  console.log(`API release suite: ${tests.length} files; both boundary files included once; test-concurrency=1.`);
  const result = spawnSync(process.execPath,
    ['--test', '--test-concurrency=1', ...tests.map(file => path.join(dist, ...file.split('/')))],
    { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
  if (result.error) throw new Error('Failed to launch the Node release test process.');
  process.exitCode = result.status ?? (128 + (os.constants.signals[result.signal] || 1));
} catch (error) {
  console.error(`API release tests refused: ${error.message}`);
  process.exitCode = 1;
}
