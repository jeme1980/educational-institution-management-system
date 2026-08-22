import assert from 'node:assert/strict';
import test from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createPlatformReferenceData, deletePlatformReferenceData, listPlatformReferenceData, updatePlatformReferenceData } from '../controllers/platform.controller';
import { requirePlatformAdmin } from '../middleware/platform-auth.middleware';
import { hashPassword } from './password';

const invoke = async (handler: any, req: any) => {
  let statusCode = 200; let body: any;
  const headers: Record<string, string> = {};
  const res: any = { status: (code: number) => { statusCode = code; return res; }, set: (values: Record<string, string>) => { Object.assign(headers, values); return res; }, setHeader: (name: string, value: string) => { headers[name] = value; return res; }, json: (value: any) => { body = value; return res; } };
  await handler(req, res);
  return { statusCode, body, headers };
};

const runMiddleware = async (req: any) => {
  let nextCalled = false; let statusCode = 0;
  const res: any = { status: (code: number) => { statusCode = code; return { json: () => undefined }; } };
  await requirePlatformAdmin(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode };
};

test('Platform reference data supports safe CRUD, protection, dependencies, and audit', async () => {
  const base = await admin.institution.findFirstOrThrow({ include: { region: true } });
  const baseLanguage = await admin.language.findFirstOrThrow();
  const suffix = Date.now().toString().slice(-8);
  const actor = await admin.user.create({ data: { email: `reference-actions-${suffix}@example.com`, normalizedEmail: `reference-actions-${suffix}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
  const request = { user: { uid: actor.id }, body: {}, params: {}, query: {} };
  const createdIds: { key: string; id: string }[] = [];
  let duplicateRegionId = '';
  try {
    const initialList = await invoke(listPlatformReferenceData, { ...request, query: {} });
    assert.equal(initialList.statusCode, 200);
    assert.equal(initialList.headers['Cache-Control'], 'no-store');
    assert.equal(initialList.headers.Pragma, 'no-cache');
    assert.equal((await invoke(createPlatformReferenceData, { ...request, params: { table: 'institutionStatuses' }, body: { nameAr: `ممنوع ${suffix}` } })).statusCode, 403);
    assert.equal((await invoke(createPlatformReferenceData, { ...request, params: { table: 'gradeLevels' }, body: { nameAr: `صف ناقص ${suffix}` } })).statusCode, 400);

    const definitions: { key: string; body: Record<string, unknown> }[] = [
      { key: 'regions', body: { nameAr: `منطقة اختبار ${suffix}`, nameHe: 'בדיקה', sortOrder: 9 } },
      { key: 'towns', body: { nameAr: `بلدة اختبار ${suffix}`, regionId: base.regionId } },
      { key: 'languages', body: { nameAr: `لغة اختبار ${suffix}`, nativeName: `Test ${suffix}`, direction: 'ltr' } },
      { key: 'educationTypes', body: { nameAr: `نوع تعليم ${suffix}` } },
      { key: 'educationStages', body: { nameAr: `مرحلة اختبار ${suffix}` } },
      { key: 'gradeLevels', body: { nameAr: `صف اختبار ${suffix}`, codeNumber: 900000 + Number(suffix) } },
      { key: 'classTypes', body: { nameAr: `شعبة اختبار ${suffix}` } },
      { key: 'compositionTypes', body: { nameAr: `تكوين اختبار ${suffix}` } },
      { key: 'genders', body: { nameAr: `جنس اختبار ${suffix}`, genderCode: `z` } },
      { key: 'studentStatuses', body: { nameAr: `حالة طالب ${suffix}`, isFinalStatus: true } },
      { key: 'enrollmentStatuses', body: { nameAr: `حالة تسجيل ${suffix}`, isFinalStatus: false } },
      { key: 'relationTypes', body: { nameAr: `علاقة اختبار ${suffix}` } },
      { key: 'studentFeatures', body: { nameAr: `خاصية اختبار ${suffix}` } },
      { key: 'providers', body: { providerCode: `T${suffix}`, name: `Provider ${suffix}` } },
    ];
    for (const definition of definitions) {
      const created = await invoke(createPlatformReferenceData, { ...request, params: { table: definition.key }, body: definition.body });
      assert.equal(created.statusCode, 201, `create ${definition.key}`);
      createdIds.push({ key: definition.key, id: created.body.id });
      const updated = await invoke(updatePlatformReferenceData, { ...request, params: { table: definition.key, id: created.body.id }, body: definition.key === 'providers' ? { name: `Updated ${suffix}` } : { nameAr: `معدل ${suffix}` } });
      assert.equal(updated.statusCode, 200, `update ${definition.key}`);
    }

    const region = createdIds.find((item) => item.key === 'regions')!;
    duplicateRegionId = region.id;
    assert.equal((await invoke(createPlatformReferenceData, { ...request, params: { table: 'regions' }, body: { nameAr: `معدل ${suffix}` } })).statusCode, 409);
    assert.equal((await invoke(deletePlatformReferenceData, { ...request, params: { table: 'regions', id: base.regionId } })).statusCode, 409);
    assert.equal((await invoke(deletePlatformReferenceData, { ...request, params: { table: 'regions', id: '00000000-0000-4000-8000-000000000099' } })).statusCode, 404);
    assert.equal((await invoke(deletePlatformReferenceData, { ...request, params: { table: 'not-a-table', id: region.id } })).statusCode, 404);

    const protectedLookup = await admin.language.findFirst({ where: { isSystem: true } });
    if (protectedLookup) {
      assert.equal((await invoke(updatePlatformReferenceData, { ...request, params: { table: 'languages', id: protectedLookup.id }, body: { isActive: false } })).statusCode, 409);
      assert.equal((await invoke(deletePlatformReferenceData, { ...request, params: { table: 'languages', id: protectedLookup.id } })).statusCode, 409);
    }

    for (const item of [...createdIds].reverse()) {
      const deleted = await invoke(deletePlatformReferenceData, { ...request, params: { table: item.key, id: item.id } });
      assert.equal(deleted.statusCode, 200, `delete ${item.key}`);
    }
    const audit = await admin.platformAuditLog.findFirst({ where: { actorUserId: actor.id, action: 'REFERENCE_DATA_DELETED', entityId: duplicateRegionId } });
    assert.ok(audit, 'successful deletion must create an audit event');
  } finally {
    for (const item of [...createdIds].reverse()) {
      await admin.platformAuditLog.deleteMany({ where: { entityId: item.id } });
      await (admin as any)[({ regions: 'region', towns: 'town', languages: 'language', educationTypes: 'educationType', educationStages: 'educationStage', gradeLevels: 'gradeLevel', classTypes: 'classType', compositionTypes: 'compositionType', genders: 'gender', studentStatuses: 'studentStatus', enrollmentStatuses: 'enrollmentStatus', relationTypes: 'relationType', studentFeatures: 'studentFeature', providers: 'provider' } as any)[item.key]]?.delete({ where: { id: item.id } }).catch(() => undefined);
    }
    await admin.platformAuditLog.deleteMany({ where: { actorUserId: actor.id } });
    await admin.region.deleteMany({ where: { nameAr: { in: [`منطقة اختبار ${suffix}`, `معدل ${suffix}`] } } });
    await admin.user.delete({ where: { id: actor.id } });
  }
});

test('Platform reference-data authorization distinguishes unauthenticated and school users', async () => {
  const schoolUser = await admin.user.findFirstOrThrow({ where: { institutionUser: { isNot: null } } });
  assert.equal((await runMiddleware({})).statusCode, 401);
  assert.equal((await runMiddleware({ user: { uid: schoolUser.id } })).statusCode, 403);
});

test('Provider reference-data validation returns field errors and handles duplicate codes', async () => {
  const suffix = Date.now().toString().slice(-8);
  const actor = await admin.user.findFirstOrThrow({ where: { isPlatformAdmin: true } });
  const request = { user: { uid: actor.id }, body: {}, params: {}, query: {} };
  const invalidNumber = await invoke(createPlatformReferenceData, { ...request, params: { table: 'providers' }, body: { providerCode: `N${suffix}`, name: 'Invalid sort order', sortOrder: 'not-a-number', isActive: true } });
  assert.equal(invalidNumber.statusCode, 400);
  assert.equal(invalidNumber.body.code, 'VALIDATION_ERROR');
  assert.equal(invalidNumber.body.fieldErrors.sortOrder, 'Sort order must be a non-negative integer.');

  const missingCode = await invoke(createPlatformReferenceData, { ...request, params: { table: 'providers' }, body: { name: 'Missing code', sortOrder: 1, isActive: true } });
  assert.equal(missingCode.statusCode, 400);
  assert.equal(missingCode.body.fieldErrors.providerCode, 'Provider code is required.');

  const created = await invoke(createPlatformReferenceData, { ...request, params: { table: 'providers' }, body: { providerCode: `V${suffix}`, name: 'Valid provider', sortOrder: 1, isActive: true } });
  assert.equal(created.statusCode, 201);
  try {
    const duplicate = await invoke(createPlatformReferenceData, { ...request, params: { table: 'providers' }, body: { providerCode: `V${suffix}`, name: 'Duplicate provider', sortOrder: 1, isActive: true } });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.body.code, 'DUPLICATE_PROVIDER_CODE');
    assert.equal(duplicate.body.fieldErrors.providerCode, 'Provider code is already in use.');
  } finally {
    await admin.platformAuditLog.deleteMany({ where: { entityId: created.body.id } });
    await admin.provider.delete({ where: { id: created.body.id } });
  }
});
