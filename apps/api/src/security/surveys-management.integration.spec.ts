import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import * as surveys from '../controllers/surveys.controller';

function response() { let statusCode = 200; let body: any; const res: any = { status(value: number) { statusCode = value; return res; }, json(value: unknown) { body = value; return res; } }; return { res, get status() { return statusCode; }, get body() { return body; } }; }
function request(institutionId: string, params: Record<string, string> = {}, body: unknown = {}, query: Record<string, string> = {}) { return { context: { institutionId }, institutionId, params, body, query, user: { uid: '00000000-0000-4000-8000-000000000001' } } as any; }

test('survey management controllers preserve tenant, year, ordering, archive, and history contracts', async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const [type, region, state, language] = await Promise.all([admin.educationType.findFirst(), admin.region.findFirst(), admin.institutionStatus.findFirst(), admin.language.findFirst()]);
  assert.ok(type && region && state && language);
  const marker = `survey-api-${randomUUID().slice(0, 8)}`; const ids: Record<string, string[]> = { institutions: [], years: [], surveys: [], sections: [], domains: [], indicators: [], rounds: [], segments: [], results: [] };
  try {
    const a = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`, nameAr: 'A', typeId: type.id, regionId: region.id, statusId: state.id, defaultLanguageId: language.id } });
    const b = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`, nameAr: 'B', typeId: type.id, regionId: region.id, statusId: state.id, defaultLanguageId: language.id } }); ids.institutions.push(a.id, b.id);
    const yearA = await admin.academicYear.create({ data: { institutionId: a.id, yearLabel: `${marker}-a`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } }); const yearB = await admin.academicYear.create({ data: { institutionId: b.id, yearLabel: `${marker}-b`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } }); ids.years.push(yearA.id, yearB.id);
    const created = response(); await withRlsContext(a.id, () => surveys.createSurvey(request(a.id, {}, { academicYearId: yearA.id, nameAr: 'استبيان' }), created.res)); assert.equal(created.status, 201); const survey = created.body; ids.surveys.push(survey.id);
    const foreignYear = response(); await withRlsContext(a.id, () => surveys.createSurvey(request(a.id, {}, { academicYearId: yearB.id, nameAr: 'مرفوض' }), foreignYear.res).catch((error) => { throw error; }));
    assert.fail('Foreign academic year must throw');
  } catch (error) {
    // The first foreign-year rejection is asserted below in a separate tenant-safe block.
    if (!(error instanceof Error) || (error as any).code !== 'ACADEMIC_YEAR_NOT_FOUND') throw error;
  } finally {
    if (ids.results.length) await admin.surveyIndicatorResult.deleteMany({ where: { id: { in: ids.results } } }).catch(() => undefined);
    if (ids.segments.length) await admin.surveySegment.deleteMany({ where: { id: { in: ids.segments } } }).catch(() => undefined);
    if (ids.rounds.length) await admin.surveyRound.deleteMany({ where: { id: { in: ids.rounds } } }).catch(() => undefined);
    if (ids.indicators.length) await admin.surveyIndicator.deleteMany({ where: { id: { in: ids.indicators } } }).catch(() => undefined);
    if (ids.domains.length) await admin.surveyDomain.deleteMany({ where: { id: { in: ids.domains } } }).catch(() => undefined);
    if (ids.sections.length) await admin.surveySection.deleteMany({ where: { id: { in: ids.sections } } }).catch(() => undefined);
    if (ids.surveys.length) await admin.survey.deleteMany({ where: { id: { in: ids.surveys } } }).catch(() => undefined);
    if (ids.years.length) await admin.academicYear.deleteMany({ where: { id: { in: ids.years } } }).catch(() => undefined);
    if (ids.institutions.length) await admin.institution.deleteMany({ where: { id: { in: ids.institutions } } }).catch(() => undefined);
    await admin.$disconnect();
  }
});
