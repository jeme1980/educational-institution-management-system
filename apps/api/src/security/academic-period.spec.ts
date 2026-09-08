import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAcademicPeriods, getAcademicPeriods } from '../controllers/settings.controller';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';

function captureResponse() {
  let statusCode = 200;
  let body: any;
  const response: any = { status(code: number) { statusCode = code; return response; }, json(value: any) { body = value; return response; } };
  return { response, get status() { return statusCode; }, get body() { return body; } };
}

async function create(institutionId: string, contextYearId: string, body: Record<string, unknown>) {
  const result = captureResponse();
  await withRlsContext(institutionId, () => createAcademicPeriods({ context: { institutionId, academicYearId: contextYearId }, body } as any, result.response));
  return result;
}

async function main() {
  const [type, region, status, language] = await Promise.all([prisma.educationType.findFirst(), prisma.region.findFirst(), prisma.institutionStatus.findFirst(), prisma.language.findFirst()]);
  assert.ok(type && region && status && language, 'Academic-period fixtures require lookup data');
  const suffix = `${Date.now()}`;
  const institutionA = await prisma.institution.create({ data: { schoolCode: suffix.slice(-10), slug: `academic-period-${suffix}-a`, nameAr: `مؤسسة الفترات ${suffix}`, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await prisma.institution.create({ data: { schoolCode: `${Number(suffix) + 1}`.slice(-10), slug: `academic-period-${suffix}-b`, nameAr: `مؤسسة أخرى ${suffix}`, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const contextYear = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `context-${suffix}`, startDate: new Date('2080-09-01T00:00:00.000Z'), endDate: new Date('2081-06-30T00:00:00.000Z'), isCurrent: true } });
  const targetYear = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `target-${suffix}`, startDate: new Date('2081-09-01T00:00:00.000Z'), endDate: new Date('2082-06-30T00:00:00.000Z') } });
  const foreignYear = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `foreign-${suffix}`, startDate: new Date('2081-09-01T00:00:00.000Z'), endDate: new Date('2082-06-30T00:00:00.000Z') } });

  try {
    const first = await create(institutionA.id, contextYear.id, { academicYearId: targetYear.id, nameAr: 'الفصل الأول', startDate: '2081-09-01', endDate: '2081-12-31', sortOrder: 1, isActive: true });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.academicYearId, targetYear.id, 'The payload year must win over the unrelated current context year');
    assert.equal(first.body.isActive, true, 'The first period can be activated immediately');
    assert.equal(first.body.startDate.toISOString(), '2081-09-01T00:00:00.000Z');

    const targetPeriods = captureResponse();
    await withRlsContext(institutionA.id, () => getAcademicPeriods({ context: { institutionId: institutionA.id, academicYearId: contextYear.id }, query: { academicYearId: targetYear.id } } as any, targetPeriods.response));
    assert.equal(targetPeriods.status, 200);
    assert.ok(targetPeriods.body.some((period: { id: string }) => period.id === first.body.id), 'The created period must load when the target year is selected');

    const fullRange = await create(institutionA.id, contextYear.id, { academicYearId: targetYear.id, nameAr: 'الفصل الكامل', startDate: '2081-09-01', endDate: '2082-06-30', sortOrder: 2, isActive: true });
    assert.equal(fullRange.status, 201, 'Dates on the academic-year boundaries must be accepted');
    assert.equal(await prisma.academicPeriod.count({ where: { institutionId: institutionA.id, academicYearId: targetYear.id, isActive: true } }), 2, 'The current schema allows more than one active period');

    const before = await create(institutionA.id, contextYear.id, { academicYearId: targetYear.id, nameAr: 'قبل السنة', startDate: '2081-08-31', endDate: '2081-12-31' });
    assert.equal(before.status, 400);
    assert.equal(before.body.code, 'ACADEMIC_PERIOD_OUTSIDE_YEAR_RANGE');
    assert.equal(before.body.error, 'يجب أن تقع تواريخ الفترة الدراسية ضمن نطاق السنة الأكاديمية.');
    assert.doesNotMatch(before.body.error, /[״]/, 'Arabic validation errors must remain valid Unicode');

    const after = await create(institutionA.id, contextYear.id, { academicYearId: targetYear.id, nameAr: 'بعد السنة', startDate: '2082-01-01', endDate: '2082-07-01' });
    assert.equal(after.status, 400);
    assert.equal(after.body.code, 'ACADEMIC_PERIOD_OUTSIDE_YEAR_RANGE');

    const reversed = await create(institutionA.id, contextYear.id, { academicYearId: targetYear.id, nameAr: 'ترتيب خاطئ', startDate: '2082-01-01', endDate: '2081-12-31' });
    assert.equal(reversed.status, 400);
    assert.equal(reversed.body.code, 'ACADEMIC_PERIOD_DATE_ORDER_INVALID');

    const invalidDate = await create(institutionA.id, contextYear.id, { academicYearId: targetYear.id, nameAr: 'تاريخ خاطئ', startDate: '2081-02-30', endDate: '2081-12-31' });
    assert.equal(invalidDate.status, 400);
    assert.equal(invalidDate.body.code, 'ACADEMIC_PERIOD_DATES_INVALID');

    const crossTenant = await create(institutionA.id, contextYear.id, { academicYearId: foreignYear.id, nameAr: 'فترة خارجية', startDate: '2081-09-01', endDate: '2081-12-31' });
    assert.equal(crossTenant.status, 404);
    assert.equal(crossTenant.body.code, 'ACADEMIC_PERIOD_YEAR_NOT_FOUND');
    assert.equal(await prisma.academicPeriod.count({ where: { institutionId: institutionB.id } }), 0);

    const routes = readFileSync(join(__dirname, '..', 'routes', 'settings.routes.js'), 'utf8');
    const createRoute = routes.split('\n').find((line) => line.includes("router.post('/academic-periods'")) || '';
    assert.match(createRoute, /requirePermission\).*\('settings', 'create'\)/, 'Creating periods must retain settings:create');
  } finally {
    await prisma.academicPeriod.deleteMany({ where: { institutionId: { in: [institutionA.id, institutionB.id] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [contextYear.id, targetYear.id, foreignYear.id] } } });
    await prisma.institution.deleteMany({ where: { id: { in: [institutionA.id, institutionB.id] } } });
  }
  console.log('Academic-period creation contract tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
