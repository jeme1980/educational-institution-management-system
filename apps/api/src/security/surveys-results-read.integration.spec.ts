import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { prisma } from '../db/prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

test('survey round results GET preserves stored aggregates and tenant boundaries', async (t) => {
  assert.notEqual(process.env['NODE_ENV'], 'production');
  const ids = { institutions: [] as string[], years: [] as string[], surveys: [] as string[], rounds: [] as string[], sections: [] as string[], domains: [] as string[], indicators: [] as string[], segments: [] as string[], users: [] as string[], staff: [] as string[], memberships: [] as string[], roles: [] as string[] };
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const [type, region, status, language, readPermission] = await Promise.all([
      admin.educationType.findFirstOrThrow(), admin.region.findFirstOrThrow(), admin.institutionStatus.findFirstOrThrow(), admin.language.findFirstOrThrow(),
      admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'READ' } } }),
    ]);
    const marker = randomUUID();
    const institution = async (suffix: string) => {
      const item = await admin.institution.create({ data: { schoolCode: `${Date.now() + (suffix === 'B' ? 1 : 0)}`.slice(-10), slug: `survey-results-read-${suffix}-${marker}`, nameAr: suffix, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
      ids.institutions.push(item.id);
      const year = await admin.academicYear.create({ data: { institutionId: item.id, yearLabel: `Results-${suffix}-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
      ids.years.push(year.id);
      return { institutionId: item.id, academicYearId: year.id };
    };
    const a = await institution('A');
    const b = await institution('B');
    const survey = async (ctx: typeof a, nameAr: string) => {
      const value = await admin.survey.create({ data: { ...ctx, nameAr, nameHe: null } });
      ids.surveys.push(value.id);
      return value;
    };
    const surveyA = await survey(a, 'الاستبيان أ');
    const surveyA2 = await survey(a, 'الاستبيان الآخر');
    const surveyB = await survey(b, 'الاستبيان ب');
    const round = async (ctx: typeof a, surveyId: string, code: string) => {
      const value = await admin.surveyRound.create({ data: { ...ctx, surveyId, code, nameAr: code, sequenceNumber: 1, measurementDate: null } });
      ids.rounds.push(value.id);
      return value;
    };
    const emptyRound = await round(a, surveyA.id, 'EMPTY');
    const resultsRound = await admin.surveyRound.create({ data: { ...a, surveyId: surveyA.id, code: 'RESULTS', nameAr: 'النتائج', sequenceNumber: 2 } });
    ids.rounds.push(resultsRound.id);
    const otherRound = await round(a, surveyA2.id, 'OTHER');
    await round(b, surveyB.id, 'FOREIGN');

    const section = async (code: string, sortOrder: number) => {
      const value = await admin.surveySection.create({ data: { institutionId: a.institutionId, surveyId: surveyA.id, code, nameAr: code, sortOrder } });
      ids.sections.push(value.id);
      return value;
    };
    const lateSection = await section('LATE_SECTION', 20);
    const earlySection = await section('EARLY_SECTION', 10);
    const domain = async (sectionId: string, code: string) => {
      const value = await admin.surveyDomain.create({ data: { institutionId: a.institutionId, surveyId: surveyA.id, sectionId, code, nameAr: code, sortOrder: 10 } });
      ids.domains.push(value.id);
      return value;
    };
    const lateDomain = await domain(lateSection.id, 'LATE_DOMAIN');
    const earlyDomain = await domain(earlySection.id, 'EARLY_DOMAIN');
    const indicator = async (domainId: string, code: string) => {
      const value = await admin.surveyIndicator.create({ data: { institutionId: a.institutionId, surveyId: surveyA.id, domainId, code, textAr: code, sortOrder: 10 } });
      ids.indicators.push(value.id);
      return value;
    };
    const lateIndicator = await indicator(lateDomain.id, 'LATE_INDICATOR');
    const earlyIndicator = await indicator(earlyDomain.id, 'EARLY_INDICATOR');
    const segment = async (code: string, sortOrder: number) => {
      const value = await admin.surveySegment.create({ data: { institutionId: a.institutionId, surveyId: surveyA.id, code, nameAr: code, sortOrder } });
      ids.segments.push(value.id);
      return value;
    };
    const lateSegment = await segment('LATE_SEGMENT', 20);
    const earlySegment = await segment('EARLY_SEGMENT', 10);
    const actor = async (ctx: typeof a, label: string, allowed: boolean) => {
      const email = `results-${label}-${marker}@fixture.test`;
      const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } }); ids.users.push(user.id);
      const staff = await admin.staffMember.create({ data: { institutionId: ctx.institutionId, firstNameAr: label, familyNameAr: 'Survey' } }); ids.staff.push(staff.id);
      const membership = await admin.institutionUser.create({ data: { institutionId: ctx.institutionId, userId: user.id, staffMemberId: staff.id } }); ids.memberships.push(membership.id);
      const role = await admin.role.create({ data: { institutionId: ctx.institutionId, nameAr: `results-${label}-${marker}` } }); ids.roles.push(role.id);
      await admin.institutionUserRole.create({ data: { institutionId: ctx.institutionId, institutionUserId: membership.id, roleId: role.id } });
      if (allowed) await admin.rolePermission.create({ data: { institutionId: ctx.institutionId, roleId: role.id, permissionId: readPermission.id } });
      return createLocalAccessToken(user.id, email);
    };
    const [tokenA, tokenB, tokenWithoutRead] = await Promise.all([actor(a, 'owner', true), actor(b, 'foreign', true), actor(a, 'no-read', false)]);
    const get = (surveyId: string, roundId: string, token?: string, ctx = a) => fetch(`http://127.0.0.1:${port}/api/surveys/${surveyId}/rounds/${roundId}/results`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-institution-id': ctx.institutionId, 'x-academic-year-id': ctx.academicYearId } });

    await t.test('authentication, permission, absent results, ownership, and tenant isolation', async () => {
      assert.equal((await get(surveyA.id, emptyRound.id)).status, 401);
      assert.equal((await get(surveyA.id, emptyRound.id, tokenWithoutRead)).status, 403);
      const empty = await get(surveyA.id, emptyRound.id, tokenA);
      assert.equal(empty.status, 200);
      const body = await empty.json();
      assert.equal(body.import, null);
      for (const key of ['indicatorResults', 'domainResults', 'comparisons', 'participation']) assert.deepEqual(body[key], []);
      const mismatched = await get(surveyA.id, otherRound.id, tokenA);
      assert.equal(mismatched.status, 404);
      assert.equal((await mismatched.json()).error.code, 'SURVEY_ROUND_NOT_FOUND');
      const foreign = await get(surveyA.id, emptyRound.id, tokenB, b);
      assert.equal(foreign.status, 404);
      assert.equal((await foreign.json()).error.code, 'SURVEY_NOT_FOUND');
      assert.equal((await get(surveyA.id, emptyRound.id, tokenA)).status, 200);
    });

    const context = { ...a, surveyId: surveyA.id, roundId: resultsRound.id };
    const batch = await admin.surveyImportBatch.create({ data: { ...context, originalFileName: 'results.xlsx', fileHash: randomUUID(), status: 'COMPLETED', rowCount: 11, validRowCount: 11, invalidRowCount: 0, importedAt: new Date('2099-10-01') } });
    const indicatorRow = async (sectionId: string, domainId: string, indicatorId: string, segmentId: string, zero: boolean) => admin.surveyIndicatorResult.create({ data: { ...context, sectionId, domainId, indicatorId, segmentId, importBatchId: batch.id, reportedPercentage: zero ? 0 : null, respondentCount: zero ? 0 : null, earnedTotal: zero ? 0 : null, possibleTotal: null } });
    await indicatorRow(lateSection.id, lateDomain.id, lateIndicator.id, lateSegment.id, false);
    await indicatorRow(earlySection.id, earlyDomain.id, earlyIndicator.id, lateSegment.id, false);
    await indicatorRow(earlySection.id, earlyDomain.id, earlyIndicator.id, earlySegment.id, true);
    const domainRow = async (domainId: string, segmentId: string, zero: boolean) => admin.surveyDomainResult.create({ data: { ...context, domainId, segmentId, importBatchId: batch.id, scorePercentage: zero ? 0 : null, respondentCount: zero ? 0 : null, isComparable: !zero } });
    await domainRow(lateDomain.id, lateSegment.id, false);
    await domainRow(earlyDomain.id, lateSegment.id, false);
    await domainRow(earlyDomain.id, earlySegment.id, true);
    // Comparison target must belong to the same survey, so use the empty round.
    const comparison = async (domainId: string, segmentId: string, comparisonType: string, zero: boolean) => admin.surveyDomainComparison.create({ data: { ...context, domainId, segmentId, comparisonType, comparisonCode: null, comparisonValue: zero ? 0 : null, comparisonRoundId: emptyRound.id, noteAr: null, noteHe: null } });
    await comparison(lateDomain.id, lateSegment.id, 'PREVIOUS_ROUND', false);
    await comparison(earlyDomain.id, earlySegment.id, 'PREVIOUS_ROUND', true);
    await comparison(earlyDomain.id, earlySegment.id, 'BASELINE', false);
    await admin.surveyParticipationResult.create({ data: { ...context, segmentId: lateSegment.id, importBatchId: batch.id, participantCount: null, eligibleCount: null, responseRate: null } });
    await admin.surveyParticipationResult.create({ data: { ...context, segmentId: earlySegment.id, importBatchId: batch.id, participantCount: 0, eligibleCount: null, responseRate: 0 } });

    await t.test('four result collections use business order, presentation metadata, and stored zero/null values', async () => {
      const response = await get(surveyA.id, resultsRound.id, tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ['survey', 'round', 'import', 'indicatorResults', 'domainResults', 'comparisons', 'participation']);
      assert.equal(body.import.id, batch.id);
      assert.equal(body.import.originalFileName, 'results.xlsx');
      assert.equal(body.import.rowCount, 11);
      assert.equal(body.import.fileHash, undefined);
      assert.equal(body.import.importedByUserId, undefined);
      assert.equal(body.survey.institutionId, undefined);
      assert.deepEqual(body.indicatorResults.map((row: any) => row.segment.code), ['EARLY_SEGMENT', 'LATE_SEGMENT', 'LATE_SEGMENT']);
      assert.deepEqual(body.indicatorResults.map((row: any) => row.indicator.code), ['EARLY_INDICATOR', 'EARLY_INDICATOR', 'LATE_INDICATOR']);
      assert.deepEqual(body.domainResults.map((row: any) => row.segment.code), ['EARLY_SEGMENT', 'LATE_SEGMENT', 'LATE_SEGMENT']);
      assert.deepEqual(body.domainResults.map((row: any) => row.domain.code), ['EARLY_DOMAIN', 'EARLY_DOMAIN', 'LATE_DOMAIN']);
      assert.deepEqual(body.comparisons.map((row: any) => row.comparisonType), ['BASELINE', 'PREVIOUS_ROUND', 'PREVIOUS_ROUND']);
      assert.deepEqual(body.comparisons.map((row: any) => row.domain.code), ['EARLY_DOMAIN', 'EARLY_DOMAIN', 'LATE_DOMAIN']);
      assert.deepEqual(body.participation.map((row: any) => row.segment.code), ['EARLY_SEGMENT', 'LATE_SEGMENT']);
      assert.equal(body.indicatorResults[0].domain.section.nameAr, 'EARLY_SECTION');
      assert.equal(body.indicatorResults[0].reportedPercentage, 0);
      assert.equal(body.indicatorResults[0].respondentCount, 0);
      assert.equal(body.indicatorResults[0].earnedTotal, 0);
      assert.equal(body.indicatorResults[0].possibleTotal, null);
      assert.equal(body.indicatorResults[1].reportedPercentage, null);
      assert.equal(body.domainResults[0].scorePercentage, 0);
      assert.equal(body.domainResults[0].respondentCount, 0);
      assert.equal(body.domainResults[0].isComparable, false);
      assert.equal(body.domainResults[1].scorePercentage, null);
      assert.equal(body.comparisons[0].comparisonValue, null);
      assert.equal(body.comparisons[1].comparisonValue, 0);
      assert.equal(body.comparisons[1].comparisonRoundCode, 'EMPTY');
      assert.equal(body.comparisons[2].comparisonValue, null);
      assert.equal(body.participation[0].participantCount, 0);
      assert.equal(body.participation[0].eligibleCount, null);
      assert.equal(body.participation[0].responseRate, 0);
      assert.equal(body.participation[1].responseRate, null);
    });
    await t.test('archived survey retains historical read; foreign GET leaves data intact', async () => {
      await admin.survey.update({ where: { id: surveyA.id }, data: { archivedAt: new Date() } });
      const archived = await get(surveyA.id, resultsRound.id, tokenA);
      assert.equal(archived.status, 200);
      assert.equal((await archived.json()).indicatorResults.length, 3);
      assert.equal((await get(surveyA.id, resultsRound.id, tokenB, b)).status, 404);
      assert.equal((await get(surveyA.id, resultsRound.id, tokenA)).status, 200);
      assert.equal(await admin.surveyIndicatorResult.count({ where: { roundId: resultsRound.id } }), 3);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const where = { surveyId: { in: ids.surveys } };
    await admin.surveyIndicatorResult.deleteMany({ where });
    await admin.surveyDomainResult.deleteMany({ where });
    await admin.surveyDomainComparison.deleteMany({ where });
    await admin.surveyParticipationResult.deleteMany({ where });
    await admin.surveyImportBatch.deleteMany({ where });
    await admin.auditLog.deleteMany({ where: { institutionId: { in: ids.institutions } } });
    await admin.surveySegment.deleteMany({ where: { id: { in: ids.segments } } });
    await admin.surveyRound.deleteMany({ where: { id: { in: ids.rounds } } });
    await admin.surveyIndicator.deleteMany({ where: { id: { in: ids.indicators } } });
    await admin.surveyDomain.deleteMany({ where: { id: { in: ids.domains } } });
    await admin.surveySection.deleteMany({ where: { id: { in: ids.sections } } });
    await admin.survey.deleteMany({ where: { id: { in: ids.surveys } } });
    await admin.institutionUserRole.deleteMany({ where: { institutionUserId: { in: ids.memberships } } });
    await admin.rolePermission.deleteMany({ where: { roleId: { in: ids.roles } } });
    await admin.institutionUser.deleteMany({ where: { id: { in: ids.memberships } } });
    await admin.role.deleteMany({ where: { id: { in: ids.roles } } });
    await admin.staffMember.deleteMany({ where: { id: { in: ids.staff } } });
    await admin.user.deleteMany({ where: { id: { in: ids.users } } });
    await admin.academicYear.deleteMany({ where: { id: { in: ids.years } } });
    await admin.institution.deleteMany({ where: { id: { in: ids.institutions } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  }
});
