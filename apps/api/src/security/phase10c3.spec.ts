import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import app from '../server';
import { prisma } from '../db/prisma';
import { platformPrisma } from '../db/platform-prisma';
import { createLocalAccessToken } from '../middleware/auth';
import { createPublicLookup, deletePublicLookup, updatePublicLookup } from '../controllers/public-lookups.controller';
import { hashPassword } from './password';

type ReferencePrivileges = {
  provider_select: boolean;
  provider_insert: boolean;
  provider_update: boolean;
  provider_delete: boolean;
  region_select: boolean;
  region_insert: boolean;
  region_update: boolean;
  region_delete: boolean;
};

const invoke = async (handler: any, request: Record<string, unknown>) => {
  let statusCode = 200;
  let body: any;
  const response: any = {
    status: (code: number) => { statusCode = code; return response; },
    json: (value: any) => { body = value; return response; },
  };
  await handler(request as any, response);
  return { statusCode, body };
};

async function assertDatabaseDenied(operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation, (error: any) => {
    const message = `${error?.message || ''} ${error?.meta?.message || ''}`.toLowerCase();
    return message.includes('permission denied') || error?.code === 'P2010';
  });
}

test('Phase 10C-3: global references are school read-only and Provider is platform-managed', async () => {
  assert.ok(process.env['RLS_RUNTIME_DATABASE_URL'], 'RLS_RUNTIME_DATABASE_URL must target school_app.');
  assert.ok(process.env['PLATFORM_DATABASE_URL'], 'PLATFORM_DATABASE_URL must target platform_app.');
  const adminUrl = process.env['MIGRATION_DATABASE_URL'] || process.env['DATABASE_URL'];
  assert.ok(adminUrl, 'MIGRATION_DATABASE_URL or DATABASE_URL is required for test fixture cleanup.');
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  const suffix = Date.now().toString().slice(-9);
  const password = 'PlatformProvider@2026!';
  const platformActor = await admin.user.create({ data: {
    email: `platform-provider-${suffix}@test.local`,
    normalizedEmail: `platform-provider-${suffix}@test.local`,
    passwordHash: await hashPassword(password),
    isActive: true,
    isPlatformAdmin: true,
  } });
  const schoolIdentity = await admin.user.findFirstOrThrow({
    where: { isPlatformAdmin: false, isActive: true, mustChangePassword: false, institutionUsers: { some: {} } },
    include: { institutionUsers: true },
  });
  let providerId = '';
  const server = createServer(app);

  try {
    const schoolPrivileges = (await prisma.$queryRawUnsafe<ReferencePrivileges[]>(`
      SELECT
        has_table_privilege(current_user, 'public.providers', 'SELECT') AS provider_select,
        has_table_privilege(current_user, 'public.providers', 'INSERT') AS provider_insert,
        has_table_privilege(current_user, 'public.providers', 'UPDATE') AS provider_update,
        has_table_privilege(current_user, 'public.providers', 'DELETE') AS provider_delete,
        has_table_privilege(current_user, 'public.regions', 'SELECT') AS region_select,
        has_table_privilege(current_user, 'public.regions', 'INSERT') AS region_insert,
        has_table_privilege(current_user, 'public.regions', 'UPDATE') AS region_update,
        has_table_privilege(current_user, 'public.regions', 'DELETE') AS region_delete
    `))[0];
    assert.deepEqual(schoolPrivileges, {
      provider_select: true,
      provider_insert: false,
      provider_update: false,
      provider_delete: false,
      region_select: true,
      region_insert: false,
      region_update: false,
      region_delete: false,
    });
    assert.ok(await prisma.provider.findMany({ take: 1 }));
    assert.ok(await prisma.region.findMany({ take: 1 }));
    await assertDatabaseDenied(() => prisma.$executeRawUnsafe(`INSERT INTO public.providers (id, "providerCode", name, "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'DENIED_${suffix}', 'Denied', NOW(), NOW())`));
    await assertDatabaseDenied(() => prisma.$executeRawUnsafe('UPDATE public.providers SET name = name WHERE FALSE'));
    await assertDatabaseDenied(() => prisma.$executeRawUnsafe('DELETE FROM public.providers WHERE FALSE'));
    await assertDatabaseDenied(() => prisma.$executeRawUnsafe('UPDATE public.regions SET "nameAr" = "nameAr" WHERE FALSE'));

    const contexts = [schoolIdentity.institutionUsers[0]!.institutionId, randomUUID()];
    const visibleProviderIds = await Promise.all(contexts.map(async () =>
      (await prisma.provider.findMany({ where: { isActive: true }, select: { id: true }, orderBy: { id: 'asc' } })).map((item) => item.id)));
    assert.deepEqual(visibleProviderIds[0], visibleProviderIds[1]);

    for (const handler of [createPublicLookup, updatePublicLookup, deletePublicLookup]) {
      const result = await invoke(handler, {
        params: { table: 'providers', id: randomUUID() },
        body: { providerCode: `SCHOOL_${suffix}`, name: 'School denied provider' },
        context: { institutionId: schoolIdentity.institutionUsers[0]!.institutionId, academicYearId: '' },
        user: { uid: schoolIdentity.id },
      });
      assert.equal(result.statusCode, 403);
    }

    const platformPrivileges = (await platformPrisma.$queryRawUnsafe<ReferencePrivileges[]>(`
      SELECT
        has_table_privilege(current_user, 'public.providers', 'SELECT') AS provider_select,
        has_table_privilege(current_user, 'public.providers', 'INSERT') AS provider_insert,
        has_table_privilege(current_user, 'public.providers', 'UPDATE') AS provider_update,
        has_table_privilege(current_user, 'public.providers', 'DELETE') AS provider_delete,
        has_table_privilege(current_user, 'public.regions', 'SELECT') AS region_select,
        has_table_privilege(current_user, 'public.regions', 'INSERT') AS region_insert,
        has_table_privilege(current_user, 'public.regions', 'UPDATE') AS region_update,
        has_table_privilege(current_user, 'public.regions', 'DELETE') AS region_delete
    `))[0];
    assert.equal(platformPrivileges.provider_select, true);
    assert.equal(platformPrivileges.provider_insert, true);
    assert.equal(platformPrivileges.provider_update, true);
    assert.equal(platformPrivileges.provider_delete, false);
    assert.equal(platformPrivileges.region_insert, false);
    await assertDatabaseDenied(() => platformPrisma.$executeRawUnsafe('DELETE FROM public.providers WHERE FALSE'));
    await assertDatabaseDenied(() => platformPrisma.$queryRawUnsafe('SELECT * FROM public.students LIMIT 1'));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: platformActor.email, password }),
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json() as any;
    const platformHeaders = { authorization: `Bearer ${loginBody.token}`, 'content-type': 'application/json' };
    assert.equal((await fetch(`${baseUrl}/api/platform/providers`, { headers: platformHeaders })).status, 200);
    const createdResponse = await fetch(`${baseUrl}/api/platform/providers`, {
      method: 'POST', headers: platformHeaders,
      body: JSON.stringify({ providerCode: `P${suffix}`.slice(0, 20), name: 'Phase 10C-3 Provider', sortOrder: 91, isActive: true }),
    });
    const createdText = await createdResponse.text();
    assert.equal(createdResponse.status, 201, createdText);
    const created = JSON.parse(createdText) as any;
    providerId = created.id;
    const updatedResponse = await fetch(`${baseUrl}/api/platform/providers/${providerId}`, {
      method: 'PATCH', headers: platformHeaders,
      body: JSON.stringify({ name: 'Phase 10C-3 Provider Updated', isActive: false }),
    });
    const updatedText = await updatedResponse.text();
    assert.equal(updatedResponse.status, 200, updatedText);
    assert.equal((JSON.parse(updatedText) as any).isActive, false);
    assert.equal((await fetch(`${baseUrl}/api/platform/providers/${providerId}`, { method: 'DELETE', headers: platformHeaders })).status, 404);

    const schoolToken = await createLocalAccessToken(schoolIdentity.id, schoolIdentity.email, schoolIdentity.securityStamp);
    const schoolPlatformResponse = await fetch(`${baseUrl}/api/platform/providers`, {
      headers: { authorization: `Bearer ${schoolToken}`, 'x-institution-id': schoolIdentity.institutionUsers[0]!.institutionId },
    });
    assert.equal(schoolPlatformResponse.status, 403);

    const audits = await admin.platformAuditLog.findMany({ where: { actorUserId: platformActor.id, entityType: 'Provider', entityId: providerId } });
    assert.equal(audits.some((item) => item.action === 'PROVIDER_CREATED'), true);
    assert.equal(audits.some((item) => item.action === 'PROVIDER_UPDATED'), true);
    assert.equal(JSON.stringify(audits).toLowerCase().includes('password'), false);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await admin.userSession.deleteMany({ where: { userId: platformActor.id } });
    await admin.platformAuditLog.deleteMany({ where: { actorUserId: platformActor.id } });
    if (providerId) await admin.provider.deleteMany({ where: { id: providerId } });
    await admin.user.deleteMany({ where: { id: platformActor.id } });
    await admin.$disconnect();
  }
});
