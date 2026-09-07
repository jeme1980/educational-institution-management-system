import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeAcademicYear, setCurrentAcademicYear, updateAcademicYearsById } from '../controllers/settings.controller';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';

function captureResponse() {
  let statusCode = 200;
  let body: any;
  const response: any = { status(code: number) { statusCode = code; return response; }, json(value: any) { body = value; return response; } };
  return { response, get status() { return statusCode; }, get body() { return body; } };
}

async function invoke(controller: typeof closeAcademicYear | typeof setCurrentAcademicYear | typeof updateAcademicYearsById, institutionId: string, academicYearId: string, body: Record<string, unknown> = {}) {
  const result = captureResponse();
  await withRlsContext(institutionId, () => controller({ context: { institutionId, academicYearId }, params: { id: academicYearId }, body } as any, result.response));
  return result;
}

async function main() {
  const [type, region, status, language] = await Promise.all([prisma.educationType.findFirst(), prisma.region.findFirst(), prisma.institutionStatus.findFirst(), prisma.language.findFirst()]);
  assert.ok(type && region && status && language, 'Academic-year close fixtures require lookup data');
  const marker = `year-close-${Date.now()}`;
  const institutionA = await prisma.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`, nameAr: marker, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await prisma.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`, nameAr: marker, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const current = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-current`, startDate: new Date('2080-09-01'), endDate: new Date('2081-06-30'), isCurrent: true } });
  const open = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-open`, startDate: new Date('2081-09-01'), endDate: new Date('2082-06-30') } });
  const race = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-race`, startDate: new Date('2082-09-01'), endDate: new Date('2083-06-30') } });
  const archived = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-archived`, startDate: new Date('2083-09-01'), endDate: new Date('2084-06-30'), archivedAt: new Date() } });
  const foreign = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `${marker}-foreign`, startDate: new Date('2080-09-01'), endDate: new Date('2081-06-30') } });
  const sourcePeriod = await prisma.academicPeriod.create({ data: { institutionId: institutionA.id, academicYearId: open.id, nameAr: marker, startDate: new Date('2081-09-01'), endDate: new Date('2082-01-31'), sortOrder: 1 } });
  try {
    const closed = await invoke(closeAcademicYear, institutionA.id, open.id);
    assert.equal(closed.status, 200);
    assert.equal(closed.body.alreadyClosed, false);
    assert.equal(closed.body.academicYear.isClosed, true);
    assert.equal(closed.body.academicYear.isCurrent, false);
    assert.equal(closed.body.academicYear.archivedAt, null);
    assert.equal(await prisma.academicPeriod.count({ where: { id: sourcePeriod.id, academicYearId: open.id } }), 1, 'Closing a year must not mutate related source data');
    assert.equal(await prisma.auditLog.count({ where: { institutionId: institutionA.id, action: 'ACADEMIC_YEAR_CLOSED', entityId: open.id } }), 1);

    const idempotent = await invoke(closeAcademicYear, institutionA.id, open.id);
    assert.equal(idempotent.status, 200);
    assert.equal(idempotent.body.alreadyClosed, true);
    assert.equal(await prisma.auditLog.count({ where: { institutionId: institutionA.id, action: 'ACADEMIC_YEAR_CLOSED', entityId: open.id } }), 1);

    const currentClose = await invoke(closeAcademicYear, institutionA.id, current.id);
    assert.equal(currentClose.status, 409);
    assert.equal(currentClose.body.code, 'ACADEMIC_YEAR_IS_CURRENT');
    const archivedClose = await invoke(closeAcademicYear, institutionA.id, archived.id);
    assert.equal(archivedClose.status, 409);
    assert.equal(archivedClose.body.code, 'ACADEMIC_YEAR_ARCHIVED');
    const crossTenant = await invoke(closeAcademicYear, institutionA.id, foreign.id);
    assert.equal(crossTenant.status, 404);

    const bypass = await invoke(updateAcademicYearsById, institutionA.id, race.id, { yearLabel: race.yearLabel, startDate: race.startDate, endDate: race.endDate, isClosed: true, isCurrent: true });
    assert.equal(bypass.status, 400);
    assert.equal(bypass.body.code, 'ACADEMIC_YEAR_STATE_ACTION_REQUIRED');
    const unchanged = await prisma.academicYear.findUniqueOrThrow({ where: { id: race.id } });
    assert.equal(unchanged.isClosed, false);
    assert.equal(unchanged.isCurrent, false);

    const [closeRace, currentRace] = await Promise.all([invoke(closeAcademicYear, institutionA.id, race.id), invoke(setCurrentAcademicYear, institutionA.id, race.id)]);
    assert.ok([200, 409].includes(closeRace.status));
    assert.ok([200, 400, 409].includes(currentRace.status));
    const raced = await prisma.academicYear.findUniqueOrThrow({ where: { id: race.id } });
    assert.equal(raced.isClosed && raced.isCurrent, false, 'Concurrent close/current must not produce a closed current year');

    const routes = readFileSync(join(__dirname, '..', 'routes', 'settings.routes.js'), 'utf8');
    const closeRoute = routes.split('\n').find((line) => line.includes("academic-years/:id/close")) || '';
    assert.match(closeRoute, /requirePermission\).*\('settings', 'update'\)/);
  } finally {
    await prisma.auditLog.deleteMany({ where: { institutionId: { in: [institutionA.id, institutionB.id] } } }).catch(() => undefined);
    await prisma.academicPeriod.deleteMany({ where: { id: sourcePeriod.id } }).catch(() => undefined);
    await prisma.academicYear.deleteMany({ where: { id: { in: [current.id, open.id, race.id, archived.id, foreign.id] } } }).catch(() => undefined);
    await prisma.institution.deleteMany({ where: { id: { in: [institutionA.id, institutionB.id] } } });
  }
  console.log('Dedicated academic-year close contract tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
