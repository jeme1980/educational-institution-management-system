import { strict as assert } from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { getInstitutionProfile, setCurrentAcademicYear, updateInstitutionProfile } from '../controllers/settings.controller';
import { institutionSettingsUpdateSchema } from '../validation/institution-settings.schemas';
import { withRlsContext } from '../middleware/rls-request.middleware';

function captureResponse() {
  let statusCode = 200;
  let body: any;
  const response: any = {
    status(code: number) { statusCode = code; return response; },
    json(value: any) { body = value; return response; },
  };
  return { response, get status() { return statusCode; }, get body() { return body; } };
}

async function main() {
  const [type, region, institutionStatus, language] = await Promise.all([
    prisma.educationType.findFirst(), prisma.region.findFirst(), prisma.institutionStatus.findFirst(), prisma.language.findFirst(),
  ]);
  assert.ok(type && region && institutionStatus && language, '8D lookup fixtures are required');
  const marker = `phase8d-${Date.now()}`;
  const institutionA = await prisma.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`, nameAr: 'Phase 8D A', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
  const institutionB = await prisma.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`, nameAr: 'Phase 8D B', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
  const yearA = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-A`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30'), isCurrent: true } });
  const yearA2 = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-A2`, startDate: new Date('2100-09-01'), endDate: new Date('2101-06-30') } });
  const yearB = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `${marker}-B`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  let closedYearId: string | undefined;
  let archivedYearId: string | undefined;
  try {
    const profileRead = captureResponse();
    await withRlsContext(institutionA.id, () => getInstitutionProfile({ context: { institutionId: institutionA.id, academicYearId: yearA.id } } as any, profileRead.response));
    assert.equal(profileRead.status, 200);
    assert.equal(profileRead.body.institution.id, institutionA.id);
    assert.equal(profileRead.body.institution.nameAr, institutionA.nameAr);
    assert.ok(profileRead.body.academicYears.some((year: any) => year.id === yearA2.id));

    const invalidInjected = institutionSettingsUpdateSchema.safeParse({ nameAr: 'Injected', institutionId: institutionB.id });
    assert.equal(invalidInjected.success, false, 'Institution identity fields must be rejected by the update contract');
    const updateResponse = captureResponse();
    await withRlsContext(institutionA.id, () => updateInstitutionProfile({ context: { institutionId: institutionA.id, academicYearId: yearA.id }, body: { nameAr: 'Phase 8D A Updated', phoneNumber: '0501234567', institutionId: institutionB.id, statusId: institutionStatus.id } } as any, updateResponse.response));
    assert.equal(updateResponse.status, 200);
    assert.equal((await prisma.institution.findUniqueOrThrow({ where: { id: institutionA.id } })).nameAr, 'Phase 8D A Updated');
    assert.equal((await prisma.institution.findUniqueOrThrow({ where: { id: institutionB.id } })).nameAr, institutionB.nameAr, 'Profile update must not cross institution boundary');

    const switchResponse = captureResponse();
    await withRlsContext(institutionA.id, () => setCurrentAcademicYear({ context: { institutionId: institutionA.id, academicYearId: yearA.id }, params: { id: yearA2.id } } as any, switchResponse.response));
    assert.equal(switchResponse.status, 200);
    const currentA = await prisma.academicYear.findMany({ where: { institutionId: institutionA.id, isCurrent: true } });
    assert.deepEqual(currentA.map((year) => year.id), [yearA2.id], 'Switch must leave exactly one current year');

    const crossResponse = captureResponse();
    await withRlsContext(institutionA.id, () => setCurrentAcademicYear({ context: { institutionId: institutionA.id, academicYearId: yearA2.id }, params: { id: yearB.id } } as any, crossResponse.response));
    assert.equal(crossResponse.status, 400, 'A year from another institution must be rejected');
    assert.equal((await prisma.academicYear.findUniqueOrThrow({ where: { id: yearB.id } })).isCurrent, false);

    try { await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-duplicate-current`, startDate: new Date('2102-09-01'), endDate: new Date('2103-06-30'), isCurrent: true } }); assert.fail('Partial unique current-year index must reject a second current year'); } catch (error: any) { assert.equal(error?.code, 'P2002'); }

    const closed = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-closed`, startDate: new Date('2103-09-01'), endDate: new Date('2104-06-30'), isClosed: true } });
    closedYearId = closed.id;
    const closedResponse = captureResponse();
    await withRlsContext(institutionA.id, () => setCurrentAcademicYear({ context: { institutionId: institutionA.id, academicYearId: yearA2.id }, params: { id: closed.id } } as any, closedResponse.response));
    assert.equal(closedResponse.status, 400);
    const archived = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-archived`, startDate: new Date('2104-09-01'), endDate: new Date('2105-06-30'), archivedAt: new Date() } });
    archivedYearId = archived.id;
    const archivedResponse = captureResponse();
    await withRlsContext(institutionA.id, () => setCurrentAcademicYear({ context: { institutionId: institutionA.id, academicYearId: yearA2.id }, params: { id: archived.id } } as any, archivedResponse.response));
    assert.equal(archivedResponse.status, 400);

    const [index, permissions] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`select indexname from pg_indexes where tablename = 'academic_years' and indexname = 'academic_years_one_current_per_institution'`),
      prisma.permission.findMany({ where: { module: 'settings', action: { in: ['READ', 'UPDATE'] } }, select: { module: true, action: true } }),
    ]);
    assert.equal(index.length, 1, 'The one-current-year database index must exist');
    assert.ok(permissions.some((item) => item.action === 'READ') && permissions.some((item) => item.action === 'UPDATE'), 'Settings read/update permissions must exist');

    const runtimeUrl = process.env['INSTITUTION_SETTINGS_RUNTIME_DATABASE_URL'];
    if (runtimeUrl) {
      const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
      try {
        assert.equal((await runtime.academicYear.findMany()).length, 0, 'Missing RLS context must hide academic years');
        const visible = await runtime.$transaction(async (tx) => { await tx.$executeRaw`select set_config('app.current_institution_id', ${institutionA.id}, true)`; return tx.academicYear.findMany(); });
        assert.ok(visible.some((year) => year.id === yearA2.id));
        assert.ok(!visible.some((year) => year.id === yearB.id));
      } finally { await runtime.$disconnect(); }
    }
  } finally {
    await prisma.academicYear.deleteMany({ where: { id: { in: [yearA.id, yearA2.id, yearB.id, closedYearId, archivedYearId].filter(Boolean) as string[] } } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { institutionId: { in: [institutionA.id, institutionB.id] } } }).catch(() => undefined);
    await prisma.institution.deleteMany({ where: { id: { in: [institutionA.id, institutionB.id] } } });
  }
  console.log('Phase 8D institution settings and current academic year tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
