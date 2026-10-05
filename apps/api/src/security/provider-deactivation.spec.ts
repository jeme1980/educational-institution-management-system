import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { platformPrisma } from '../db/platform-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { createLocalAccessToken } from '../middleware/auth';
import { createStaffDevelopment, getStaffDevelopments, updateStaffDevelopment } from '../controllers/staff.controller';
import { getPublicLookups } from '../controllers/public-lookups.controller';

async function invoke(handler: any, request: any): Promise<{ status: number; body: any }> {
  let status = 200;
  let body: any;
  const response: any = {
    status: (code: number) => { status = code; return response; },
    json: (value: any) => { body = value; return response; },
  };
  await handler(request, response);
  return { status, body };
}

test('platform_app cannot directly delete Providers but retains read/create/update grants', async () => {
  const [grants] = await platformPrisma.$queryRaw<{
    can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean; other_reference_delete: boolean;
  }[]>`
    SELECT has_table_privilege(current_user, 'public.providers', 'SELECT') AS can_select,
      has_table_privilege(current_user, 'public.providers', 'INSERT') AS can_insert,
      has_table_privilege(current_user, 'public.providers', 'UPDATE') AS can_update,
      has_table_privilege(current_user, 'public.providers', 'DELETE') AS can_delete,
      has_table_privilege(current_user, 'public.regions', 'DELETE') AS other_reference_delete
  `;
  assert.deepEqual(grants, {
    can_select: true, can_insert: true, can_update: true, can_delete: false, other_reference_delete: true,
  });
  await assert.rejects(() => platformPrisma.$executeRaw`DELETE FROM public.providers WHERE FALSE`,
    (error: any) => String(error?.meta?.message || error?.message).toLowerCase().includes('permission denied'));
});

test('Provider HTTP deactivate/reactivate preserves history and blocks DELETE with or without dependencies', async () => {
  const base = await admin.institution.findFirstOrThrow();
  const actor = await admin.user.findFirstOrThrow({ where: { isPlatformAdmin: true } });
  const suffix = randomUUID().slice(0, 8);
  const institution = await admin.institution.create({ data: {
    schoolCode: `P4P${suffix}`, slug: `provider-4p-${suffix}`, nameAr: 'Provider hardening fixture',
    typeId: base.typeId, regionId: base.regionId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId,
  } });
  const staff = await admin.staffMember.create({ data: {
    institutionId: institution.id, firstNameAr: 'Test', familyNameAr: 'Staff',
  } });
  const [used, unused] = await Promise.all([
    admin.provider.create({ data: { providerCode: `P4U${suffix}`, name: 'Used Provider', isActive: true } }),
    admin.provider.create({ data: { providerCode: `P4N${suffix}`, name: 'Unused Provider', isActive: true } }),
  ]);
  let developmentId = '';
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = await createLocalAccessToken(actor.id, actor.email, actor.securityStamp);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const body = {
      staffMemberId: staff.id, courseCode: `P4P-${suffix}`, courseName: 'Historical course',
      providerId: used.id, hoursCount: 4, startDate: '2026-01-01', endDate: '2026-01-02',
    };
    const request = { context: { institutionId: institution.id }, body, user: { uid: actor.id }, params: {} };
    const created = await withRlsContext(institution.id, () => invoke(createStaffDevelopment, request));
    assert.equal(created.status, 201);
    developmentId = created.body.id;

    for (const provider of [unused, used]) {
      const deleted = await fetch(`${baseUrl}/api/platform/reference-data/providers/${provider.id}`, { method: 'DELETE', headers });
      assert.equal(deleted.status, 409);
      assert.equal((await deleted.json() as any).code, 'PROVIDER_DELETE_NOT_ALLOWED');
      assert.ok(await admin.provider.findUnique({ where: { id: provider.id } }));
      assert.equal(await admin.platformAuditLog.count({ where: { entityId: provider.id, action: 'REFERENCE_DATA_DELETED' } }), 0);
    }

    const deactivate = await fetch(`${baseUrl}/api/platform/reference-data/providers/${used.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: false }),
    });
    assert.equal(deactivate.status, 200);
    assert.equal((await deactivate.json() as any).isActive, false);
    const list = await fetch(`${baseUrl}/api/platform/reference-data?table=providers`, { headers });
    assert.equal(list.status, 200);
    assert.equal((await list.json() as any).providers.find((item: any) => item.id === used.id)?.isActive, false);

    const historical = await withRlsContext(institution.id, () => invoke(getStaffDevelopments, request));
    const historicalRow = historical.body.find((item: any) => item.id === developmentId);
    assert.equal(historicalRow.providerId, used.id);
    assert.equal(historicalRow.provider?.id, used.id);
    assert.equal(historicalRow.provider?.name, used.name);
    const schoolLookups = await withRlsContext(institution.id, () => invoke(getPublicLookups, request));
    assert.equal(schoolLookups.body.providers.some((item: any) => item.id === used.id), false);
    assert.equal(schoolLookups.body.providers.some((item: any) => item.id === unused.id), true);

    const rejectedCreate = await withRlsContext(institution.id, () => invoke(createStaffDevelopment, {
      ...request, body: { ...body, courseCode: `BAD-${suffix}` },
    }));
    assert.equal(rejectedCreate.status, 400);
    const rejectedAssignment = await withRlsContext(institution.id, () => invoke(updateStaffDevelopment, {
      ...request, params: { id: developmentId }, body: { ...body, providerId: used.id },
    }));
    // The original inactive provider is allowed to remain on its own historical record.
    assert.equal(rejectedAssignment.status, 200);
    const otherInactive = await fetch(`${baseUrl}/api/platform/reference-data/providers/${unused.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: false }),
    });
    assert.equal(otherInactive.status, 200);
    const changedToInactive = await withRlsContext(institution.id, () => invoke(updateStaffDevelopment, {
      ...request, params: { id: developmentId }, body: { ...body, providerId: unused.id },
    }));
    assert.equal(changedToInactive.status, 400);
    const unrelatedEdit = await withRlsContext(institution.id, () => invoke(updateStaffDevelopment, {
      ...request, params: { id: developmentId }, body: { ...body, courseName: 'Historical course edited' },
    }));
    assert.equal(unrelatedEdit.status, 200);
    assert.equal(unrelatedEdit.body.providerId, used.id);
    assert.equal(unrelatedEdit.body.courseName, 'Historical course edited');

    const reactivate = await fetch(`${baseUrl}/api/platform/reference-data/providers/${used.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: true }),
    });
    assert.equal(reactivate.status, 200);
    assert.equal((await reactivate.json() as any).isActive, true);
    const activeCreate = await withRlsContext(institution.id, () => invoke(createStaffDevelopment, {
      ...request, body: { ...body, courseCode: `OK-${suffix}` },
    }));
    assert.equal(activeCreate.status, 201);
    await admin.staffDevelopment.delete({ where: { id: activeCreate.body.id } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (developmentId) await admin.staffDevelopment.deleteMany({ where: { id: developmentId } });
    await admin.platformAuditLog.deleteMany({ where: { entityId: { in: [used.id, unused.id] } } });
    await admin.provider.deleteMany({ where: { id: { in: [used.id, unused.id] } } });
    await admin.staffMember.delete({ where: { id: staff.id } });
    await admin.institution.delete({ where: { id: institution.id } });
  }
});
