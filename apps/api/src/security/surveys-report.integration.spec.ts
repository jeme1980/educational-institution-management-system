import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { prisma } from '../db/prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

test('survey report composes stored results, trends and comparisons within tenant scope', async (t) => {
  assert.notEqual(process.env['NODE_ENV'], 'production');
  const ids = { institutions: [] as string[], years: [] as string[], surveys: [] as string[], rounds: [] as string[], sections: [] as string[], domains: [] as string[], indicators: [] as string[], segments: [] as string[], users: [] as string[], staff: [] as string[], memberships: [] as string[], roles: [] as string[] };
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const [type, region, status, language, readPermission] = await Promise.all([
      admin.educationType.findFirstOrThrow(), admin.region.findFirstOrThrow(), admin.institutionStatus.findFirstOrThrow(), admin.language.findFirstOrThrow(),
      admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'READ' } } }),
    ]);
    const marker = randomUUID();
    const institution = async (label: string) => {
      const item = await admin.institution.create({ data: { schoolCode: String(randomInt(1_000_000_000, 9_999_999_999)), slug: `survey-report-${label}-${marker}`, nameAr: label, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
      ids.institutions.push(item.id);
      const year = await admin.academicYear.create({ data: { institutionId: item.id, yearLabel: `Report-${label}-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
      ids.years.push(year.id);
      return { institutionId: item.id, academicYearId: year.id };
    };
    const a = await institution('A');
    const b = await institution('B');
    const survey = await admin.survey.create({ data: { ...a, nameAr: 'تقرير الاستبيان', descriptionAr: 'وصف التقرير', audienceType: 'STAFF' } }); ids.surveys.push(survey.id);
    const otherSurvey = await admin.survey.create({ data: { ...a, nameAr: 'استبيان آخر' } }); ids.surveys.push(otherSurvey.id);
    const foreignSurvey = await admin.survey.create({ data: { ...b, nameAr: 'استبيان ب' } }); ids.surveys.push(foreignSurvey.id);
    const round = async (surveyId: string, sequenceNumber: number, code: string) => {
      const item = await admin.surveyRound.create({ data: { ...a, surveyId, sequenceNumber, code, nameAr: code, measurementDate: new Date(`2099-10-${String(sequenceNumber).padStart(2, '0')}`) } });
      ids.rounds.push(item.id); return item;
    };
    const r3 = await round(survey.id, 3, 'THIRD');
    const r1 = await round(survey.id, 1, 'FIRST');
    const r2 = await round(survey.id, 2, 'SECOND');
    const wrongRound = await round(otherSurvey.id, 1, 'OTHER');
    const foreignRound = await admin.surveyRound.create({ data: { ...b, surveyId: foreignSurvey.id, sequenceNumber: 1, code: 'FOREIGN', nameAr: 'FOREIGN' } }); ids.rounds.push(foreignRound.id);
    const section = await admin.surveySection.create({ data: { institutionId: a.institutionId, surveyId: survey.id, code: 'SECTION', nameAr: 'قسم', sortOrder: 1 } }); ids.sections.push(section.id);
    const domain = async (code: string, sortOrder: number) => {
      const item = await admin.surveyDomain.create({ data: { institutionId: a.institutionId, surveyId: survey.id, sectionId: section.id, code, nameAr: code, sortOrder } }); ids.domains.push(item.id); return item;
    };
    const mainDomain = await domain('MAIN', 1);
    const comparisonOnlyDomain = await domain('COMPARISON_ONLY', 2);
    const resultOnlyDomain = await domain('RESULT_ONLY', 3);
    const indicator = async (code: string, sortOrder: number) => {
      const item = await admin.surveyIndicator.create({ data: { institutionId: a.institutionId, surveyId: survey.id, domainId: mainDomain.id, code, textAr: code, sortOrder } }); ids.indicators.push(item.id); return item;
    };
    const mainIndicator = await indicator('MAIN', 1);
    const zeroIndicator = await indicator('ZERO', 2);
    const segment = async (surveyId: string, code: string, sortOrder: number) => {
      const item = await admin.surveySegment.create({ data: { institutionId: a.institutionId, surveyId, code, nameAr: code, sortOrder } }); ids.segments.push(item.id); return item;
    };
    const laterSegment = await segment(survey.id, 'LATER', 20);
    const firstSegment = await segment(survey.id, 'FIRST', 10);
    const unusedSegment = await segment(survey.id, 'UNUSED', 30);
    const wrongSegment = await segment(otherSurvey.id, 'OTHER', 1);
    const foreignSegment = await admin.surveySegment.create({ data: { institutionId: b.institutionId, surveyId: foreignSurvey.id, code: 'FOREIGN', nameAr: 'FOREIGN' } }); ids.segments.push(foreignSegment.id);
    const actor = async (ctx: typeof a, label: string, allowed: boolean) => {
      const email = `report-${label}-${marker}@fixture.test`;
      const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } }); ids.users.push(user.id);
      const staff = await admin.staffMember.create({ data: { institutionId: ctx.institutionId, firstNameAr: label, familyNameAr: 'Survey' } }); ids.staff.push(staff.id);
      const membership = await admin.institutionUser.create({ data: { institutionId: ctx.institutionId, userId: user.id, staffMemberId: staff.id } }); ids.memberships.push(membership.id);
      const role = await admin.role.create({ data: { institutionId: ctx.institutionId, nameAr: `report-${label}-${marker}` } }); ids.roles.push(role.id);
      await admin.institutionUserRole.create({ data: { institutionId: ctx.institutionId, institutionUserId: membership.id, roleId: role.id } });
      if (allowed) await admin.rolePermission.create({ data: { institutionId: ctx.institutionId, roleId: role.id, permissionId: readPermission.id } });
      return createLocalAccessToken(user.id, email);
    };
    const tokenA = await actor(a, 'owner', true);
    const tokenB = await actor(b, 'foreign', true);
    const tokenWithoutRead = await actor(a, 'no-read', false);
    const get = (path: string, token?: string, ctx = a) => fetch(`http://127.0.0.1:${port}/api/surveys/${survey.id}/${path}`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-institution-id': ctx.institutionId, 'x-academic-year-id': ctx.academicYearId } });
    const report = (query = '', token?: string, ctx = a) => get(`analytics/report${query}`, token, ctx);
    const context = { ...a, surveyId: survey.id };
    const indicatorResult = (roundId: string, segmentId: string, indicatorId: string, reportedPercentage: number | null) =>
      admin.surveyIndicatorResult.create({ data: { ...context, roundId, sectionId: section.id, domainId: mainDomain.id, indicatorId, segmentId, reportedPercentage, respondentCount: 0, earnedTotal: 0, possibleTotal: 0 } });
    const domainResult = (roundId: string, segmentId: string, domainId: string, scorePercentage: number | null) =>
      admin.surveyDomainResult.create({ data: { ...context, roundId, domainId, segmentId, scorePercentage, respondentCount: 0, isComparable: false } });
    const comparison = (roundId: string, segmentId: string, domainId: string, comparisonValue: number | null, comparisonType = 'PREVIOUS_ROUND') =>
      admin.surveyDomainComparison.create({ data: { ...context, roundId, domainId, segmentId, comparisonType, comparisonValue, comparisonRoundId: r1.id, comparisonCode: 'IMPORTED' } });
    const participation = (roundId: string, segmentId: string, responseRate: number | null) =>
      admin.surveyParticipationResult.create({ data: { ...context, roundId, segmentId, responseRate, participantCount: 0, eligibleCount: 10 } });

    await t.test('permission, tenant isolation and empty report with ordered rounds', async () => {
      assert.equal((await report()).status, 401);
      assert.equal((await report('', tokenWithoutRead)).status, 403);
      const foreign = await report('', tokenB, b);
      assert.equal(foreign.status, 404);
      assert.equal((await foreign.json()).error.code, 'SURVEY_NOT_FOUND');
      const response = await report('', tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ['survey', 'rounds', 'segments', 'selectedRound', 'selectedSegment', 'snapshot', 'trends', 'comparisons']);
      assert.deepEqual(body.rounds.map((item: { id: string }) => item.id), [r1.id, r2.id, r3.id]);
      assert.deepEqual(body.segments.map((item: { id: string }) => item.id), [firstSegment.id, laterSegment.id, unusedSegment.id]);
      assert.deepEqual(Object.keys(body.survey), ['id', 'academicYearId', 'nameAr', 'nameHe', 'descriptionAr', 'descriptionHe', 'audienceType', 'status', 'archivedAt']);
      assert.equal(body.survey.institutionId, undefined);
      assert.equal(body.selectedRound, null);
      assert.equal(body.selectedSegment, null);
      assert.deepEqual(body.snapshot, { indicatorResults: [], domainResults: [], participation: null });
      assert.deepEqual(body.trends, { indicatorTrends: [], domainTrends: [], participationTrend: null });
      assert.deepEqual(body.comparisons, []);
    });

    await indicatorResult(r1.id, firstSegment.id, mainIndicator.id, 60);
    await indicatorResult(r3.id, firstSegment.id, mainIndicator.id, 75);
    await indicatorResult(r3.id, laterSegment.id, mainIndicator.id, 42);
    await domainResult(r1.id, firstSegment.id, mainDomain.id, 30);
    await domainResult(r3.id, firstSegment.id, mainDomain.id, 0);
    await domainResult(r3.id, firstSegment.id, resultOnlyDomain.id, null);
    await participation(r3.id, firstSegment.id, 0);
    await comparison(r3.id, firstSegment.id, mainDomain.id, 99);
    await comparison(r3.id, firstSegment.id, comparisonOnlyDomain.id, 0, 'EXTERNAL_BENCHMARK');

    await t.test('default picks last data-bearing round and first data-bearing segment by business order', async () => {
      const body = await (await report('', tokenA)).json();
      assert.equal(body.selectedRound.id, r3.id);
      assert.equal(body.selectedSegment.id, firstSegment.id);
      assert.equal(body.snapshot.indicatorResults.length, 1);
      assert.equal(body.snapshot.indicatorResults[0].reportedPercentage, 75);
      assert.equal(body.snapshot.domainResults[0].scorePercentage, 0);
      assert.equal(body.snapshot.domainResults[0].respondentCount, 0);
      assert.equal(body.snapshot.domainResults[0].isComparable, false);
      assert.equal(body.snapshot.participation.responseRate, 0);
      assert.equal(body.comparisons.length, 3);
      assert.equal(body.comparisons.find((group: { domainId: string }) => group.domainId === comparisonOnlyDomain.id).domainResult, null);
      assert.deepEqual(body.comparisons.find((group: { domainId: string }) => group.domainId === resultOnlyDomain.id).comparisons, []);
      assert.equal(body.comparisons.find((group: { domainId: string }) => group.domainId === mainDomain.id).comparisons[0].comparisonValue, 99);
      assert.equal(body.comparisons.find((group: { domainId: string }) => group.domainId === mainDomain.id).comparisons[0].comparisonRoundCode, 'FIRST');
      assert.equal(body.comparisons.find((group: { domainId: string }) => group.domainId === comparisonOnlyDomain.id).comparisons[0].comparisonValue, 0);
    });

    await t.test('explicit round and segment isolate snapshot, trends and comparisons', async () => {
      const query = `?roundId=${r1.id}&segmentId=${firstSegment.id}`;
      const body = await (await report(query, tokenA)).json();
      assert.equal(body.selectedRound.id, r1.id);
      assert.equal(body.selectedSegment.id, firstSegment.id);
      assert.equal(body.snapshot.indicatorResults[0].reportedPercentage, 60);
      assert.equal(body.snapshot.domainResults[0].scorePercentage, 30);
      assert.equal(body.snapshot.participation, null);
      assert.equal(body.comparisons.length, 1);
      assert.deepEqual(body.comparisons[0].comparisons, []);
      const otherSegment = await (await report(`?roundId=${r3.id}&segmentId=${laterSegment.id}`, tokenA)).json();
      assert.equal(otherSegment.snapshot.indicatorResults[0].reportedPercentage, 42);
      assert.deepEqual(otherSegment.snapshot.domainResults, []);
      assert.equal(otherSegment.snapshot.participation, null);
      assert.deepEqual(otherSegment.comparisons, []);
      assert.equal(otherSegment.trends.indicatorTrends[0].segment.id, laterSegment.id);
    });

    await t.test('wrong survey round and segment are hidden; data-free explicit round stays empty', async () => {
      const wrongRoundResponse = await report(`?roundId=${wrongRound.id}`, tokenA);
      assert.equal(wrongRoundResponse.status, 404);
      assert.equal((await wrongRoundResponse.json()).error.code, 'SURVEY_ROUND_NOT_FOUND');
      const wrongSegmentResponse = await report(`?segmentId=${wrongSegment.id}`, tokenA);
      assert.equal(wrongSegmentResponse.status, 404);
      assert.equal((await wrongSegmentResponse.json()).error.code, 'SURVEY_SEGMENT_NOT_FOUND');
      assert.equal((await report(`?roundId=${foreignRound.id}`, tokenA)).status, 404);
      assert.equal((await report(`?segmentId=${foreignSegment.id}`, tokenA)).status, 404);
      const empty = await (await report(`?roundId=${r2.id}`, tokenA)).json();
      assert.equal(empty.selectedRound.id, r2.id);
      assert.equal(empty.selectedSegment, null);
      assert.deepEqual(empty.snapshot, { indicatorResults: [], domainResults: [], participation: null });
      const unused = await (await report(`?roundId=${r3.id}&segmentId=${unusedSegment.id}`, tokenA)).json();
      assert.equal(unused.selectedSegment.id, unusedSegment.id);
      assert.deepEqual(unused.snapshot, { indicatorResults: [], domainResults: [], participation: null });
      assert.deepEqual(unused.comparisons, []);
    });

    await indicatorResult(r2.id, firstSegment.id, mainIndicator.id, null);
    await indicatorResult(r3.id, firstSegment.id, zeroIndicator.id, 0);
    await t.test('trend arithmetic exactly matches Trends API across a stored-null point', async () => {
      const body = await (await report('', tokenA)).json();
      const trends = await (await get('analytics/trends', tokenA)).json();
      assert.deepEqual(body.trends.indicatorTrends, trends.indicatorTrends.filter((item: { segment: { id: string } }) => item.segment.id === firstSegment.id));
      assert.deepEqual(body.trends.domainTrends, trends.domainTrends.filter((item: { segment: { id: string } }) => item.segment.id === firstSegment.id));
      assert.deepEqual(body.trends.participationTrend, trends.participationTrends.find((item: { segment: { id: string } }) => item.segment.id === firstSegment.id));
      const main = body.trends.indicatorTrends.find((item: { indicator: { id: string } }) => item.indicator.id === mainIndicator.id);
      assert.deepEqual(main.points.map((point: { value: number | null }) => point.value), [60, null, 75]);
      assert.deepEqual(main.points.map((point: { deltaFromPrevious: number | null }) => point.deltaFromPrevious), [null, null, 15]);
      assert.equal(main.changeFromFirst, 15);
      assert.equal(body.snapshot.indicatorResults.find((item: { indicator: { id: string } }) => item.indicator.id === zeroIndicator.id).reportedPercentage, 0);
    });

    await t.test('reported comparisons exactly match Comparisons API, including imported previous-round value', async () => {
      const body = await (await report('', tokenA)).json();
      const comparisons = await (await get('analytics/comparisons', tokenA)).json();
      assert.deepEqual(body.comparisons, comparisons.groups.filter((group: { roundId: string; segmentId: string }) => group.roundId === r3.id && group.segmentId === firstSegment.id));
      assert.equal(body.comparisons.find((group: { domainId: string }) => group.domainId === mainDomain.id).comparisons[0].comparisonValue, 99);
      assert.equal(body.snapshot.domainResults.find((item: { domain: { id: string } }) => item.domain.id === mainDomain.id).scorePercentage, 0);
    });

    const r4 = await round(survey.id, 4, 'INDICATORS_ONLY');
    const r5 = await round(survey.id, 5, 'DOMAINS_ONLY');
    const r6 = await round(survey.id, 6, 'PARTICIPATION_ONLY');
    const r7 = await round(survey.id, 7, 'COMPARISONS_ONLY');
    await indicatorResult(r4.id, firstSegment.id, mainIndicator.id, 0);
    await domainResult(r5.id, firstSegment.id, mainDomain.id, 0);
    await participation(r6.id, firstSegment.id, 0);
    await comparison(r7.id, firstSegment.id, comparisonOnlyDomain.id, null);
    await t.test('each single stored source selects its round and preserves zero or null', async () => {
      const expected = [
        [r4.id, 1, 0, false, 0],
        [r5.id, 0, 1, false, 1],
        [r6.id, 0, 0, true, 0],
        [r7.id, 0, 0, false, 1],
      ] as const;
      for (const [roundId, indicators, domains, hasParticipation, comparisons] of expected) {
        const body = await (await report(`?roundId=${roundId}`, tokenA)).json();
        assert.equal(body.selectedRound.id, roundId);
        assert.equal(body.selectedSegment.id, firstSegment.id);
        assert.equal(body.snapshot.indicatorResults.length, indicators);
        assert.equal(body.snapshot.domainResults.length, domains);
        assert.equal(Boolean(body.snapshot.participation), hasParticipation);
        assert.equal(body.comparisons.length, comparisons);
      }
      const defaultReport = await (await report('', tokenA)).json();
      assert.equal(defaultReport.selectedRound.id, r7.id);
      assert.equal(defaultReport.comparisons[0].comparisons[0].comparisonValue, null);
    });

    await t.test('archived survey remains readable without changing historical values', async () => {
      await admin.survey.update({ where: { id: survey.id }, data: { archivedAt: new Date() } });
      const response = await report('', tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.notEqual(body.survey.archivedAt, null);
      assert.equal(body.selectedRound.id, r7.id);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    const where = { surveyId: { in: ids.surveys } };
    await admin.surveyIndicatorResult.deleteMany({ where });
    await admin.surveyDomainResult.deleteMany({ where });
    await admin.surveyDomainComparison.deleteMany({ where });
    await admin.surveyParticipationResult.deleteMany({ where });
    await admin.surveyImportBatch.deleteMany({ where });
    await admin.auditLog.deleteMany({ where: { institutionId: { in: ids.institutions } } });
    await admin.surveyIndicator.deleteMany({ where: { id: { in: ids.indicators } } });
    await admin.surveySegment.deleteMany({ where: { id: { in: ids.segments } } });
    await admin.surveyRound.deleteMany({ where: { id: { in: ids.rounds } } });
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
    await Promise.all([prisma.$disconnect(), admin.$disconnect()]);
  }
});
