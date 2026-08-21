import assert from 'node:assert/strict';
import test from 'node:test';
import { testAdminPrisma as platformPrisma } from '../db/test-admin-prisma';
import { archiveInstitution, createInstitution, getInstitution, listInstitutions, restoreInstitution, updateInstitution } from '../controllers/platform.controller';
import { hashPassword } from './password';

const invoke = async (handler: any, req: any) => {
  let statusCode = 200; let body: any;
  const res: any = { status: (code: number) => { statusCode = code; return res; }, json: (value: any) => { body = value; return res; } };
  await handler(req, res);
  return { statusCode, body };
};

test('Platform institution lifecycle archives and restores without deleting relations', async () => {
  const base = await platformPrisma.institution.findFirstOrThrow();
  const suffix = Date.now().toString().slice(-8);
  const actor = await platformPrisma.user.create({ data: { email: `platform-lifecycle-${suffix}@example.com`, normalizedEmail: `platform-lifecycle-${suffix}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
  const request = { user: { uid: actor.id }, body: { schoolCode: `LC${suffix}`, slug: `lifecycle-${suffix}`, nameAr: 'مؤسسة دورة الحياة', typeId: base.typeId, regionId: base.regionId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId }, params: {}, query: {} };
  let institutionId = '';
  try {
    const created = await invoke(createInstitution, request);
    assert.equal(created.statusCode, 201);
    institutionId = created.body.institution.id;
    const updated = await invoke(updateInstitution, { ...request, params: { id: institutionId }, body: { ...request.body, nameAr: 'مؤسسة دورة الحياة المعدلة' } });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.nameAr, 'مؤسسة دورة الحياة المعدلة');
    const archived = await invoke(archiveInstitution, { ...request, params: { id: institutionId } });
    assert.equal(archived.statusCode, 200);
    assert.ok(archived.body.archivedAt);
    assert.equal((await invoke(listInstitutions, { ...request, query: {} })).body.some((item: any) => item.id === institutionId), false);
    assert.equal((await invoke(listInstitutions, { ...request, query: { scope: 'archived' } })).body.some((item: any) => item.id === institutionId), true);
    assert.equal((await invoke(getInstitution, { ...request, params: { id: institutionId } })).statusCode, 200);
    const restored = await invoke(restoreInstitution, { ...request, params: { id: institutionId } });
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.body.archivedAt, null);
    const audit = await platformPrisma.platformAuditLog.findMany({ where: { targetInstitutionId: institutionId }, orderBy: { createdAt: 'asc' } });
    assert.ok(audit.some((item: any) => item.action === 'INSTITUTION_UPDATED'));
    assert.ok(audit.some((item: any) => item.action === 'INSTITUTION_ARCHIVED'));
    assert.ok(audit.some((item: any) => item.action === 'INSTITUTION_RESTORED'));
    assert.equal((await invoke(updateInstitution, { ...request, params: { id: '00000000-0000-4000-8000-000000000099' }, body: request.body })).statusCode, 404);
    assert.equal((await invoke(archiveInstitution, { ...request, params: { id: 'not-a-uuid' } })).statusCode, 400);
  } finally {
    if (institutionId) { await platformPrisma.platformAuditLog.deleteMany({ where: { targetInstitutionId: institutionId } }); await platformPrisma.institution.delete({ where: { id: institutionId } }); }
    await platformPrisma.user.delete({ where: { id: actor.id } });
  }
});
