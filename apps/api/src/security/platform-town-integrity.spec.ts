import assert from 'node:assert/strict';
import test from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createInstitution, createPlatformReferenceData, listPlatformReferenceData, updateInstitution, updatePlatformReferenceData } from '../controllers/platform.controller';
import { hashPassword } from './password';

const invoke = async (handler: any, req: any) => {
  let statusCode = 200; let body: any;
  const res: any = { status: (code: number) => { statusCode = code; return res; }, json: (value: any) => { body = value; return res; } };
  await handler(req, res);
  return { statusCode, body };
};

test('Platform Town and Institution APIs preserve Region-Town integrity', async () => {
  const base = await admin.institution.findFirstOrThrow({ where: { townId: { not: null } }, include: { town: true } });
  const baseTown = await admin.town.findUniqueOrThrow({ where: { id: base.townId! } });
  const baseRegion = await admin.region.findUniqueOrThrow({ where: { id: base.regionId } });
  const suffix = Date.now().toString().slice(-8);
  const actor = await admin.user.create({ data: { email: `town-integrity-${suffix}@example.com`, normalizedEmail: `town-integrity-${suffix}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
  const otherRegion = await admin.region.create({ data: { nameAr: `منطقة اختبار ${suffix}`, sortOrder: 99 } });
  let institutionId = '';
  let createdTownId = '';
  const request = { user: { uid: actor.id }, body: {}, params: {}, query: {} };
  try {
    assert.equal((await invoke(createPlatformReferenceData, { ...request, params: { table: 'towns' }, body: { nameAr: `بلدة بلا منطقة ${suffix}` } })).statusCode, 400);
    assert.equal((await invoke(createPlatformReferenceData, { ...request, params: { table: 'towns' }, body: { nameAr: `بلدة منطقة غير صحيحة ${suffix}`, regionId: '00000000-0000-4000-8000-000000000099' } })).statusCode, 400);
    const createdTown = await invoke(createPlatformReferenceData, { ...request, params: { table: 'towns' }, body: { nameAr: `بلدة اختبار ${suffix}`, regionId: baseRegion.id } });
    assert.equal(createdTown.statusCode, 201);
    createdTownId = createdTown.body.id;
    const listed = await invoke(listPlatformReferenceData, { ...request, query: { table: 'towns' } });
    const listedTown = listed.body.towns.find((item: any) => item.id === createdTownId);
    assert.equal(listedTown.region.id, baseRegion.id);
    assert.equal((await invoke(updatePlatformReferenceData, { ...request, params: { table: 'towns', id: createdTownId }, body: { regionId: otherRegion.id } })).statusCode, 409);
    const common = { schoolCode: `TI${suffix}`, slug: `town-integrity-${suffix}`, nameAr: 'مؤسسة توافق', typeId: base.typeId, regionId: baseRegion.id, townId: baseTown.id, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId };
    const compatible = await invoke(createInstitution, { ...request, body: common });
    assert.equal(compatible.statusCode, 201);
    institutionId = compatible.body.institution.id;
    assert.equal((await invoke(createInstitution, { ...request, body: { ...common, schoolCode: `TM${suffix}`, slug: `town-mismatch-${suffix}`, regionId: otherRegion.id } })).statusCode, 400);
    assert.equal((await invoke(updateInstitution, { ...request, params: { id: institutionId }, body: { ...common, regionId: otherRegion.id } })).statusCode, 400);
  } finally {
    if (institutionId) { await admin.platformAuditLog.deleteMany({ where: { targetInstitutionId: institutionId } }); await admin.institution.delete({ where: { id: institutionId } }); }
    if (createdTownId) { await admin.platformAuditLog.deleteMany({ where: { entityId: createdTownId } }); await admin.town.delete({ where: { id: createdTownId } }); }
    await admin.region.delete({ where: { id: otherRegion.id } });
    await admin.user.delete({ where: { id: actor.id } });
  }
});
