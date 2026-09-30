import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { prisma } from '../db/prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

test('survey multi-round trends use stored measurements and enforce tenant read access', async (t) => {
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
    const institution = async (label: string) => {
      const item = await admin.institution.create({ data: { schoolCode: String(randomInt(1_000_000_000, 9_999_999_999)), slug: `survey-trends-${label}-${marker}`, nameAr: label, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
      ids.institutions.push(item.id);
      const year = await admin.academicYear.create({ data: { institutionId: item.id, yearLabel: `Trends-${label}-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
      ids.years.push(year.id);
      return { institutionId: item.id, academicYearId: year.id };
    };
    const a = await institution('A');
    const b = await institution('B');
    const survey = await admin.survey.create({ data: { ...a, nameAr: 'استبيان الاتجاهات' } }); ids.surveys.push(survey.id);
    const foreignSurvey = await admin.survey.create({ data: { ...b, nameAr: 'استبيان ب' } }); ids.surveys.push(foreignSurvey.id);
    const round = async (sequenceNumber: number, code: string, day: number) => {
      const item = await admin.surveyRound.create({ data: { ...a, surveyId: survey.id, sequenceNumber, code, nameAr: code, measurementDate: new Date(`2099-10-${String(day).padStart(2, '0')}`) } });
      ids.rounds.push(item.id); return item;
    };
    // Insertion order intentionally disagrees with business order.
    const r3 = await round(3, 'END', 30);
    const r1 = await round(1, 'START', 1);
    const r2 = await round(2, 'MIDDLE', 15);
    const section = await admin.surveySection.create({ data: { institutionId: a.institutionId, surveyId: survey.id, code: 'SECTION', nameAr: 'قسم', sortOrder: 10 } }); ids.sections.push(section.id);
    const lateSection = await admin.surveySection.create({ data: { institutionId: a.institutionId, surveyId: survey.id, code: 'LATE_SECTION', nameAr: 'قسم آخر', sortOrder: 20 } }); ids.sections.push(lateSection.id);
    const domain = await admin.surveyDomain.create({ data: { institutionId: a.institutionId, surveyId: survey.id, sectionId: section.id, code: 'DOMAIN', nameAr: 'مجال', sortOrder: 10 } }); ids.domains.push(domain.id);
    const lateDomain = await admin.surveyDomain.create({ data: { institutionId: a.institutionId, surveyId: survey.id, sectionId: lateSection.id, code: 'LATE_DOMAIN', nameAr: 'مجال آخر', sortOrder: 0 } }); ids.domains.push(lateDomain.id);
    const indicator = async (code: string, sortOrder: number) => {
      const item = await admin.surveyIndicator.create({ data: { institutionId: a.institutionId, surveyId: survey.id, domainId: domain.id, code, textAr: code, sortOrder, isReverseDirection: true } });
      ids.indicators.push(item.id); return item;
    };
    const main = await indicator('MAIN', 1);
    const missing = await indicator('MISSING', 2);
    const zero = await indicator('ZERO', 3);
    const decimal = await indicator('DECIMAL', 4);
    const lateIndicator = await admin.surveyIndicator.create({ data: { institutionId: a.institutionId, surveyId: survey.id, domainId: lateDomain.id, code: 'LATE', textAr: 'مؤشر آخر', sortOrder: 0 } }); ids.indicators.push(lateIndicator.id);
    const segment = async (code: string, sortOrder: number) => {
      const item = await admin.surveySegment.create({ data: { institutionId: a.institutionId, surveyId: survey.id, code, nameAr: code, sortOrder } });
      ids.segments.push(item.id); return item;
    };
    const school = await segment('SCHOOL', 1);
    const grade = await segment('GRADE_5', 2);
    const actor = async (ctx: typeof a, label: string, allowed: boolean) => {
      const email = `trends-${label}-${marker}@fixture.test`;
      const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } }); ids.users.push(user.id);
      const staff = await admin.staffMember.create({ data: { institutionId: ctx.institutionId, firstNameAr: label, familyNameAr: 'Survey' } }); ids.staff.push(staff.id);
      const membership = await admin.institutionUser.create({ data: { institutionId: ctx.institutionId, userId: user.id, staffMemberId: staff.id } }); ids.memberships.push(membership.id);
      const role = await admin.role.create({ data: { institutionId: ctx.institutionId, nameAr: `trends-${label}-${marker}` } }); ids.roles.push(role.id);
      await admin.institutionUserRole.create({ data: { institutionId: ctx.institutionId, institutionUserId: membership.id, roleId: role.id } });
      if (allowed) await admin.rolePermission.create({ data: { institutionId: ctx.institutionId, roleId: role.id, permissionId: readPermission.id } });
      return createLocalAccessToken(user.id, email);
    };
    const tokenA = await actor(a, 'owner', true);
    const tokenB = await actor(b, 'foreign', true);
    const tokenWithoutRead = await actor(a, 'no-read', false);
    const get = (token?: string, ctx = a) => fetch(`http://127.0.0.1:${port}/api/surveys/${survey.id}/analytics/trends`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-institution-id': ctx.institutionId, 'x-academic-year-id': ctx.academicYearId } });
    const resultContext = { ...a, surveyId: survey.id };
    const indicatorResult = async (roundId: string, indicatorId: string, segmentId: string, reportedPercentage: number | null, respondentCount: number | null = null) => admin.surveyIndicatorResult.create({ data: { ...resultContext, roundId, sectionId: section.id, domainId: domain.id, indicatorId, segmentId, reportedPercentage, respondentCount } });
    const domainResult = async (roundId: string, scorePercentage: number | null) => admin.surveyDomainResult.create({ data: { ...resultContext, roundId, domainId: domain.id, segmentId: school.id, scorePercentage, respondentCount: 0, isComparable: true } });
    const participationResult = async (roundId: string, responseRate: number | null, participantCount: number | null, eligibleCount: number | null) => admin.surveyParticipationResult.create({ data: { ...resultContext, roundId, segmentId: school.id, responseRate, participantCount, eligibleCount } });

    await t.test('read permission, tenant boundary, and three rounds without results', async () => {
      assert.equal((await get()).status, 401);
      assert.equal((await get(tokenWithoutRead)).status, 403);
      const foreign = await get(tokenB, b);
      assert.equal(foreign.status, 404);
      assert.equal((await foreign.json()).error.code, 'SURVEY_NOT_FOUND');
      const response = await get(tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ['survey', 'rounds', 'indicatorTrends', 'domainTrends', 'participationTrends']);
      assert.deepEqual(body.rounds.map((item: { id: string }) => item.id), [r1.id, r2.id, r3.id]);
      assert.equal(body.survey.institutionId, undefined);
      assert.deepEqual(body.indicatorTrends, []);
      assert.deepEqual(body.domainTrends, []);
      assert.deepEqual(body.participationTrends, []);
    });

    await indicatorResult(r1.id, main.id, school.id, 60, 0);
    await domainResult(r1.id, 20);
    await participationResult(r1.id, 0, 0, 10);
    await t.test('one measurement has dense points and no delta or change', async () => {
      const response = await get(tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      const trend = body.indicatorTrends[0];
      assert.deepEqual(trend.points.map((point: { value: number | null }) => point.value), [60, null, null]);
      assert.deepEqual(trend.points.map((point: { deltaFromPrevious: number | null }) => point.deltaFromPrevious), [null, null, null]);
      assert.equal(trend.firstValue, 60);
      assert.equal(trend.latestValue, 60);
      assert.equal(trend.changeFromFirst, null);
    });

    await indicatorResult(r2.id, main.id, school.id, 70);
    await indicatorResult(r3.id, main.id, school.id, 65);
    await indicatorResult(r1.id, main.id, grade.id, 55);
    await indicatorResult(r1.id, missing.id, school.id, 60);
    await indicatorResult(r3.id, missing.id, school.id, 75);
    await indicatorResult(r1.id, zero.id, school.id, 0);
    await indicatorResult(r2.id, zero.id, school.id, 10);
    await indicatorResult(r3.id, zero.id, school.id, null);
    await indicatorResult(r1.id, decimal.id, school.id, 60.1);
    await indicatorResult(r2.id, decimal.id, school.id, 70.2);
    await admin.surveyIndicatorResult.create({ data: { ...resultContext, roundId: r3.id, sectionId: lateSection.id, domainId: lateDomain.id, indicatorId: lateIndicator.id, segmentId: grade.id, reportedPercentage: 44 } });
    await domainResult(r2.id, 25);
    await domainResult(r3.id, 22);
    await admin.surveyDomainResult.create({ data: { ...resultContext, roundId: r2.id, domainId: lateDomain.id, segmentId: grade.id, scorePercentage: null, isComparable: true } });
    await participationResult(r2.id, 50, 5, 10);
    await participationResult(r3.id, null, null, null);
    await admin.surveyParticipationResult.create({ data: { ...resultContext, roundId: r3.id, segmentId: grade.id, responseRate: 33, participantCount: 1, eligibleCount: 3 } });
    await admin.surveyDomainComparison.create({ data: { ...resultContext, roundId: r2.id, domainId: domain.id, segmentId: school.id, comparisonType: 'PREVIOUS_ROUND', comparisonValue: 99 } });

    await t.test('three rounds preserve identity, stored values, missing/null/zero, and percentage-point deltas', async () => {
      const response = await get(tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.rounds.map((item: { code: string }) => item.code), ['START', 'MIDDLE', 'END']);
      assert.deepEqual(body.indicatorTrends.map((item: { indicator: { code: string }; segment: { code: string } }) => `${item.indicator.code}:${item.segment.code}`), ['MAIN:SCHOOL', 'MAIN:GRADE_5', 'MISSING:SCHOOL', 'ZERO:SCHOOL', 'DECIMAL:SCHOOL', 'LATE:GRADE_5']);
      const [mainTrend, gradeTrend, missingTrend, zeroTrend, decimalTrend] = body.indicatorTrends;
      assert.deepEqual(mainTrend.points.map((point: { value: number | null }) => point.value), [60, 70, 65]);
      assert.deepEqual(mainTrend.points.map((point: { deltaFromPrevious: number | null }) => point.deltaFromPrevious), [null, 10, -5]);
      assert.equal(mainTrend.changeFromFirst, 5);
      assert.equal(mainTrend.indicator.isReverseDirection, true);
      assert.deepEqual(gradeTrend.points.map((point: { value: number | null }) => point.value), [55, null, null]);
      assert.deepEqual(missingTrend.points.map((point: { value: number | null }) => point.value), [60, null, 75]);
      assert.deepEqual(missingTrend.points.map((point: { deltaFromPrevious: number | null }) => point.deltaFromPrevious), [null, null, 15]);
      assert.deepEqual(zeroTrend.points.map((point: { value: number | null }) => point.value), [0, 10, null]);
      assert.equal(zeroTrend.firstValue, 0);
      assert.equal(zeroTrend.latestValue, 10);
      assert.equal(zeroTrend.changeFromFirst, 10);
      assert.equal(zeroTrend.points[2].respondentCount, null);
      assert.deepEqual(decimalTrend.points.map((point: { deltaFromPrevious: number | null }) => point.deltaFromPrevious), [null, 10.1, null]);
      assert.equal(decimalTrend.changeFromFirst, 10.1);
      assert.deepEqual(body.domainTrends.map((item: { domain: { code: string }; segment: { code: string } }) => `${item.domain.code}:${item.segment.code}`), ['DOMAIN:SCHOOL', 'LATE_DOMAIN:GRADE_5']);
      assert.deepEqual(body.domainTrends[0].points.map((point: { value: number | null }) => point.value), [20, 25, 22]);
      assert.deepEqual(body.domainTrends[0].points.map((point: { deltaFromPrevious: number | null }) => point.deltaFromPrevious), [null, 5, -3]);
      assert.equal(body.domainTrends[0].points[0].respondentCount, 0);
      assert.deepEqual(body.domainTrends[1].points.map((point: { value: number | null }) => point.value), [null, null, null]);
      assert.deepEqual(body.domainTrends[1].points.map((point: { isComparable: boolean | null }) => point.isComparable), [null, true, null]);
      assert.deepEqual(body.participationTrends.map((item: { segment: { code: string } }) => item.segment.code), ['SCHOOL', 'GRADE_5']);
      assert.deepEqual(body.participationTrends[0].points.map((point: { responseRate: number | null }) => point.responseRate), [0, 50, null]);
      assert.deepEqual(body.participationTrends[0].points.map((point: { participantCount: number | null }) => point.participantCount), [0, 5, null]);
      assert.deepEqual(body.participationTrends[0].points.map((point: { eligibleCount: number | null }) => point.eligibleCount), [10, 10, null]);
      assert.deepEqual(body.participationTrends[0].points.map((point: { deltaFromPrevious: number | null }) => point.deltaFromPrevious), [null, 50, null]);
      assert.equal(body.participationTrends[0].changeFromFirst, 50);
      assert.equal(JSON.stringify(body).includes('comparisonValue'), false);
    });

    await t.test('archive preserves historical trends and foreign tenant still sees 404', async () => {
      await admin.survey.update({ where: { id: survey.id }, data: { archivedAt: new Date() } });
      const response = await get(tokenA);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).indicatorTrends.length, 6);
      assert.equal((await get(tokenB, b)).status, 404);
      assert.equal((await get(tokenA)).status, 200);
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
