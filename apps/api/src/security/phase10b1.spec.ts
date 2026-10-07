import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import app from '../server';
import { bootstrapPlatformAdmin } from '../db/system-bootstrap';
import { seedDevelopmentDatabase } from '../db/seed';

const originalNodeEnv = process.env['NODE_ENV'];
const originalEmail = process.env['PLATFORM_ADMIN_EMAIL'];
const originalPassword = process.env['PLATFORM_ADMIN_PASSWORD'];
const apiRoot = resolve(__dirname, '../..');
const repositoryRoot = resolve(apiRoot, '../..');

after(() => {
  if (originalNodeEnv === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = originalNodeEnv;
  if (originalEmail === undefined) delete process.env['PLATFORM_ADMIN_EMAIL']; else process.env['PLATFORM_ADMIN_EMAIL'] = originalEmail;
  if (originalPassword === undefined) delete process.env['PLATFORM_ADMIN_PASSWORD']; else process.env['PLATFORM_ADMIN_PASSWORD'] = originalPassword;
});

test('production API route graph does not register POST /api/seed', async () => {
  process.env['NODE_ENV'] = 'production';
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/seed`, { method: 'POST' });
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('API startup source has no automatic seed path', async () => {
  const source = await readFile(resolve(apiRoot, 'src/server.ts'), 'utf8');
  assert.doesNotMatch(source, /seedDatabase|seedDevelopmentDatabase|runSeed/);
});

test('development seed is explicit and contains no fixed password', async () => {
  const source = await readFile(resolve(apiRoot, 'src/db/seed.ts'), 'utf8');
  assert.match(source, /DEV_SEED_ADMIN_PASSWORD/);
  assert.match(source, /NODE_ENV.*production/);
  assert.doesNotMatch(source, /Admin@2026!/);
});

test('development seed refuses to run in production', async () => {
  process.env['NODE_ENV'] = 'production';
  await assert.rejects(seedDevelopmentDatabase(), /disabled when NODE_ENV=production/);
});

test('production bootstrap does not create demo institution or school user', async () => {
  const source = await readFile(resolve(apiRoot, 'src/db/system-bootstrap.ts'), 'utf8');
  assert.doesNotMatch(source, /client\.institution\.(?:create|upsert)/);
  assert.doesNotMatch(source, /client\.town\.(?:create|upsert)/);
  assert.doesNotMatch(source, /DEMO|admin@school\.edu/);
});

test('repeated platform bootstrap does not reset an existing password', async () => {
  process.env['PLATFORM_ADMIN_EMAIL'] = 'platform.phase10b1@test.local';
  process.env['PLATFORM_ADMIN_PASSWORD'] = 'A-development-secret-used-only-by-test';
  let createCalled = false;
  const existingUser: { id: string; isPlatformAdmin: boolean; institutionUsers: { id: string }[]; passwordHash: string } = {
    id: 'existing', isPlatformAdmin: true, institutionUsers: [], passwordHash: 'unchanged',
  };
  const client = {
    user: {
      findUnique: async () => existingUser,
      create: async () => { createCalled = true; throw new Error('create must not run for an existing platform administrator'); },
    },
  };
  assert.equal(await bootstrapPlatformAdmin(client as never), 'EXISTS');
  assert.equal(createCalled, false);
});

test('web production command serves the SPA artifact instead of a missing SSR file', async () => {
  const packageJson = JSON.parse(await readFile(resolve(apiRoot, '../web/package.json'), 'utf8')) as { scripts: { start: string } };
  assert.match(packageJson.scripts.start, /serve-spa\.mjs/);
  assert.doesNotMatch(packageJson.scripts.start, /server\.mjs/);
});

test('clean dependency installation regenerates the workspace Prisma client', async () => {
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8')) as { scripts: { postinstall: string } };
  assert.match(packageJson.scripts.postinstall, /db:generate.*@school-management-system\/api/);
});
