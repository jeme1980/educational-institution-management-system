import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { prisma } from '../db/prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

test('survey reported comparisons preserve imported values and tenant boundaries', async (t) => {
  assert.notEqual(process.env['NODE_ENV'], 'production');
  const ids = { institutions: [] as string[], years: [] as string[], surveys: [] as string[], rounds: [] as string[], sections: [] as string[], domains: [] as string[], segments: [] as string[], users: [] as string[], staff: [] as string[], memberships: [] as string[], roles: [] as string[] };
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
      const item = await admin.institution.create({ data: { schoolCode: String(randomInt(1_000_000_000, 9_999_999_999)), slug: `survey-comparisons-${label}-${marker}`, nameAr: label, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
      ids.institutions.push(item.id);
      const year = await admin.academicYear.create({ data: { institutionId: item.id, yearLabel: `Comparisons-${label}-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
      ids.years.push(year.id);
      return { institutionId: item.id, academicYearId: year.id };
    };
    const a = await institution('A');
    const b = await institution('B');
    const survey = await admin.survey.create({ data: { ...a, nameAr: 'Reported comparisons' } }); ids.surveys.push(survey.id);
    const foreignSurvey = await admin.survey.create({ data: { ...b, nameAr: 'Other school' } }); ids.surveys.push(foreignSurvey.id);
    const round = async (sequenceNumber: number, code: string, day: number) => {
      const item = await admin.surveyRound.create({ data: { ...a, surveyId: survey.id, sequenceNumber, code, nameAr: code, measurementDate: new Date(`2099-10-${String(day).padStart(2, '0')}`) } });
      ids.rounds.push(item.id);
      return item;
    };
    // Insertion order deliberately differs from the round business order.
    const r2 = await round(2, 'SECOND', 20);
    const r1 = await round(1, 'FIRST', 1);
    const r3 = await round(3, 'THIRD', 30);
    const section = async (code: string, sortOrder: number) => {
      const item = await admin.surveySection.create({ data: { institutionId: a.institutionId, surveyId: survey.id, code, nameAr: code, sortOrder } }); ids.sections.push(item.id); return item;
    };
    const lateSection = await section('LATE_SECTION', 20);
    const earlySection = await section('EARLY_SECTION', 10);
    const domain = async (sectionId: string, code: string, sortOrder: number) => {
      const item = await admin.surveyDomain.create({ data: { institutionId: a.institutionId, surveyId: survey.id, sectionId, code, nameAr: code, sortOrder } }); ids.domains.push(item.id); return item;
    };
    const lateDomain = await domain(lateSection.id, 'LATE_DOMAIN', 20);
    const middleDomain = await domain(earlySection.id, 'MIDDLE_DOMAIN', 30);
    const earlyDomain = await domain(earlySection.id, 'EARLY_DOMAIN', 10);
    const segment = async (code: string, sortOrder: number) => {
      const item = await admin.surveySegment.create({ data: { institutionId: a.institutionId, surveyId: survey.id, code, nameAr: code, sortOrder } }); ids.segments.push(item.id); return item;
    };
    const lateSegment = await segment('LATE_SEGMENT', 20);
    const earlySegment = await segment('EARLY_SEGMENT', 10);
    const actor = async (ctx: typeof a, label: string, allowed: boolean) => {
      const email = `comparisons-${label}-${marker}@fixture.test`;
      const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } }); ids.users.push(user.id);
      const staff = await admin.staffMember.create({ data: { institutionId: ctx.institutionId, firstNameAr: label, familyNameAr: 'Survey' } }); ids.staff.push(staff.id);
      const membership = await admin.institutionUser.create({ data: { institutionId: ctx.institutionId, userId: user.id, staffMemberId: staff.id } }); ids.memberships.push(membership.id);
      const role = await admin.role.create({ data: { institutionId: ctx.institutionId, nameAr: `comparisons-${label}-${marker}` } }); ids.roles.push(role.id);
      await admin.institutionUserRole.create({ data: { institutionId: ctx.institutionId, institutionUserId: membership.id, roleId: role.id } });
      if (allowed) await admin.rolePermission.create({ data: { institutionId: ctx.institutionId, roleId: role.id, permissionId: readPermission.id } });
      return createLocalAccessToken(user.id, email);
    };
    const tokenA = await actor(a, 'owner', true);
    const tokenB = await actor(b, 'foreign', true);
    const tokenWithoutRead = await actor(a, 'no-read', false);
    const get = (token?: string, ctx = a) => fetch(`http://127.0.0.1:${port}/api/surveys/${survey.id}/analytics/comparisons`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-institution-id': ctx.institutionId, 'x-academic-year-id': ctx.academicYearId } });

    await t.test('read permission, hidden foreign resource, and empty groups with ordered rounds', async () => {
      assert.equal((await get()).status, 401);
      assert.equal((await get(tokenWithoutRead)).status, 403);
      const foreign = await get(tokenB, b);
      assert.equal(foreign.status, 404);
      assert.equal((await foreign.json()).error.code, 'SURVEY_NOT_FOUND');
      const response = await get(tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ['survey', 'rounds', 'groups']);
      assert.deepEqual(Object.keys(body.survey), ['id', 'nameAr', 'nameHe', 'academicYearId', 'archivedAt']);
      assert.deepEqual(body.rounds.map((item: { id: string }) => item.id), [r1.id, r2.id, r3.id]);
      assert.deepEqual(body.groups, []);
    });

    const context = { ...a, surveyId: survey.id };
    const result = (roundId: string, domainId: string, segmentId: string, scorePercentage: number | null, respondentCount: number | null, isComparable: boolean) =>
      admin.surveyDomainResult.create({ data: { ...context, roundId, domainId, segmentId, scorePercentage, respondentCount, isComparable } });
    const comparison = (roundId: string, domainId: string, segmentId: string, comparisonType: string, comparisonValue: number | null, options: { comparisonCode?: string | null; comparisonRoundId?: string | null; noteAr?: string | null; noteHe?: string | null } = {}) =>
      admin.surveyDomainComparison.create({ data: { ...context, roundId, domainId, segmentId, comparisonType, comparisonValue, ...options } });

    // Create later-round data first to prove ordering does not follow insertion order.
    await comparison(r2.id, earlyDomain.id, earlySegment.id, 'SIMILAR_SCHOOLS', 70, { comparisonCode: 'REPORT_2026' });
    await result(r2.id, earlyDomain.id, earlySegment.id, 75, 8, true);
    await comparison(r2.id, earlyDomain.id, earlySegment.id, 'EXTERNAL_BENCHMARK', 82, { noteAr: '', noteHe: 'note' });
    await result(r1.id, earlyDomain.id, earlySegment.id, 30, 3, true);
    await comparison(r2.id, earlyDomain.id, earlySegment.id, 'PREVIOUS_ROUND', 99, { comparisonRoundId: r1.id, comparisonCode: 'IMPORTED', noteAr: 'reported' });
    await result(r1.id, lateDomain.id, lateSegment.id, 72, null, true);
    await result(r1.id, middleDomain.id, earlySegment.id, null, null, true);
    await comparison(r1.id, earlyDomain.id, lateSegment.id, 'EXTERNAL_BENCHMARK', null, { noteAr: null, noteHe: null });
    await result(r2.id, lateDomain.id, earlySegment.id, 0, 0, false);
    await comparison(r2.id, lateDomain.id, earlySegment.id, 'SIMILAR_SCHOOLS', 0);
    await comparison(r3.id, earlyDomain.id, earlySegment.id, 'BASELINE', 0);

    await t.test('union groups keep partial data, segments, rounds, ordering, and stored zero/null', async () => {
      const response = await get(tokenA);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.groups.map((g: { roundId: string; domain: { code: string }; segment: { code: string } }) => `${g.roundId}:${g.domain.code}:${g.segment.code}`), [
        `${r1.id}:EARLY_DOMAIN:EARLY_SEGMENT`, `${r1.id}:EARLY_DOMAIN:LATE_SEGMENT`, `${r1.id}:MIDDLE_DOMAIN:EARLY_SEGMENT`, `${r1.id}:LATE_DOMAIN:LATE_SEGMENT`,
        `${r2.id}:EARLY_DOMAIN:EARLY_SEGMENT`, `${r2.id}:LATE_DOMAIN:EARLY_SEGMENT`, `${r3.id}:EARLY_DOMAIN:EARLY_SEGMENT`,
      ]);
      assert.equal(body.groups[2].domainResult.scorePercentage, null);
      const resultOnly = body.groups[3];
      assert.equal(resultOnly.domainResult.scorePercentage, 72);
      assert.deepEqual(resultOnly.comparisons, []);
      const comparisonOnly = body.groups[1];
      assert.equal(comparisonOnly.domainResult, null);
      assert.equal(comparisonOnly.comparisons[0].comparisonValue, null);
      assert.equal(comparisonOnly.comparisons[0].noteAr, null);
      const zero = body.groups[5];
      assert.equal(zero.domainResult.scorePercentage, 0);
      assert.equal(zero.domainResult.respondentCount, 0);
      assert.equal(zero.domainResult.isComparable, false);
      assert.equal(zero.comparisons[0].comparisonValue, 0);
      assert.deepEqual(Object.keys(zero.domainResult), ['id', 'scorePercentage', 'respondentCount', 'isComparable']);
      assert.deepEqual(Object.keys(zero.comparisons[0]), ['id', 'comparisonType', 'comparisonCode', 'comparisonValue', 'comparisonRoundCode', 'noteAr', 'noteHe']);
      assert.equal(body.groups[6].domainResult, null);
      assert.equal(body.groups[6].comparisons[0].comparisonValue, 0);
    });

    await t.test('full group returns imported comparisons unchanged, including deliberately different PREVIOUS_ROUND', async () => {
      const body = await (await get(tokenA)).json();
      const full = body.groups[4];
      assert.equal(full.domainResult.scorePercentage, 75);
      assert.deepEqual(full.comparisons.map((row: { comparisonType: string; comparisonValue: number }) => [row.comparisonType, row.comparisonValue]), [
        ['EXTERNAL_BENCHMARK', 82], ['PREVIOUS_ROUND', 99], ['SIMILAR_SCHOOLS', 70],
      ]);
      assert.equal(body.groups[0].domainResult.scorePercentage, 30);
      assert.equal(full.comparisons[1].comparisonRoundCode, 'FIRST');
      assert.equal(full.comparisons[1].comparisonCode, 'IMPORTED');
      assert.equal(full.comparisons[1].noteAr, 'reported');
      assert.equal(full.comparisons[0].noteAr, '');
      assert.equal(full.comparisons[0].noteHe, 'note');
      assert.equal(full.domain.section.code, 'EARLY_SECTION');
      assert.equal(full.section.code, 'EARLY_SECTION');
      assert.equal(full.segment.code, 'EARLY_SEGMENT');
      assert.equal(JSON.stringify(body).includes('changeFromFirst'), false);
      assert.equal(JSON.stringify(body).includes('difference'), false);
      assert.equal(JSON.stringify(body).includes('institutionId'), false);
    });

    await t.test('archived survey retains historical comparisons and foreign tenant still sees 404', async () => {
      await admin.survey.update({ where: { id: survey.id }, data: { archivedAt: new Date() } });
      const response = await get(tokenA);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).groups.length, 7);
      assert.equal((await get(tokenB, b)).status, 404);
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
