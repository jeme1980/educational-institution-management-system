import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { previewSurveyExcelSemantics } from './surveys-excel.semantic';
import type { SurveyExcelSemanticPreviewInput, SurveyExcelValidatedWorkbook } from './surveys-excel.types';

type Fixture = {
  institutionAId: string;
  institutionBId: string;
  yearAId: string;
  surveyAId: string;
  archivedSurveyAId: string;
  surveyBId: string;
  roundA1Id: string;
  roundA2Id: string;
  roundBId: string;
  sectionAId: string;
  domainAId: string;
  indicatorAId: string;
  schoolSegmentAId: string;
  gradeSegmentAId: string;
};

const created = {
  institutions: [] as string[],
  years: [] as string[],
  surveys: [] as string[],
  sections: [] as string[],
  domains: [] as string[],
  indicators: [] as string[],
  rounds: [] as string[],
  segments: [] as string[],
};

async function createFixture(): Promise<Fixture> {
  const [type, region, status, language] = await Promise.all([
    admin.educationType.findFirstOrThrow(),
    admin.region.findFirstOrThrow(),
    admin.institutionStatus.findFirstOrThrow(),
    admin.language.findFirstOrThrow(),
  ]);
  const marker = randomUUID();
  const institutionA = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `survey-semantic-a-${marker}`, nameAr: 'Semantic A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `survey-semantic-b-${marker}`, nameAr: 'Semantic B', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  created.institutions.push(institutionA.id, institutionB.id);
  const yearA = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `A-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const yearB = await admin.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `B-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  created.years.push(yearA.id, yearB.id);
  const surveyA = await admin.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'Survey A' } });
  const archivedSurveyA = await admin.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'Archived Survey A', archivedAt: new Date() } });
  const surveyB = await admin.survey.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: 'Survey B' } });
  created.surveys.push(surveyA.id, archivedSurveyA.id, surveyB.id);
  const sectionA = await admin.surveySection.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SECTION_A', nameAr: 'Section A' } });
  const sectionB = await admin.surveySection.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'SECTION_B', nameAr: 'Section B' } });
  created.sections.push(sectionA.id, sectionB.id);
  const domainA = await admin.surveyDomain.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, sectionId: sectionA.id, code: 'DOMAIN_A', nameAr: 'Domain A' } });
  const domainB = await admin.surveyDomain.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, sectionId: sectionB.id, code: 'FOREIGN_DOMAIN', nameAr: 'Domain B' } });
  created.domains.push(domainA.id, domainB.id);
  const indicatorA = await admin.surveyIndicator.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, domainId: domainA.id, code: 'INDICATOR_A', textAr: 'Indicator A', reportingRuleCode: 'DIRECT_PERCENT' } });
  const indicatorB = await admin.surveyIndicator.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, domainId: domainB.id, code: 'FOREIGN_INDICATOR', textAr: 'Indicator B' } });
  created.indicators.push(indicatorA.id, indicatorB.id);
  const roundA1 = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: 'ROUND_A1', nameAr: 'Round A1', sequenceNumber: 1 } });
  const roundA2 = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: 'ROUND_A2', nameAr: 'Round A2', sequenceNumber: 2 } });
  const roundB = await admin.surveyRound.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, surveyId: surveyB.id, code: 'ROUND_B', nameAr: 'Round B', sequenceNumber: 1 } });
  created.rounds.push(roundA1.id, roundA2.id, roundB.id);
  const schoolSegmentA = await admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SCHOOL', nameAr: 'School' } });
  const gradeSegmentA = await admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'GRADE_5', nameAr: 'Grade 5' } });
  const segmentB = await admin.surveySegment.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'FOREIGN_SEGMENT', nameAr: 'Foreign segment' } });
  created.segments.push(schoolSegmentA.id, gradeSegmentA.id, segmentB.id);
  return {
    institutionAId: institutionA.id,
    institutionBId: institutionB.id,
    yearAId: yearA.id,
    surveyAId: surveyA.id,
    archivedSurveyAId: archivedSurveyA.id,
    surveyBId: surveyB.id,
    roundA1Id: roundA1.id,
    roundA2Id: roundA2.id,
    roundBId: roundB.id,
    sectionAId: sectionA.id,
    domainAId: domainA.id,
    indicatorAId: indicatorA.id,
    schoolSegmentAId: schoolSegmentA.id,
    gradeSegmentAId: gradeSegmentA.id,
  };
}

const validWorkbook = (): SurveyExcelValidatedWorkbook => ({
  indicatorResults: [{ sourceSheet: 'IndicatorResults', sourceRow: 2, indicatorCode: 'INDICATOR_A', segmentCode: 'SCHOOL', reportedPercentage: 81, respondentCount: 10, earnedTotal: null, possibleTotal: null }],
  domainResults: [{ sourceSheet: 'DomainResults', sourceRow: 2, domainCode: 'DOMAIN_A', segmentCode: 'GRADE_5', scorePercentage: 73, respondentCount: 8, isComparable: true }],
  comparisons: [{ sourceSheet: 'Comparisons', sourceRow: 2, domainCode: 'DOMAIN_A', segmentCode: 'SCHOOL', comparisonType: 'PREVIOUS_ROUND', comparisonCode: null, comparisonValue: 69, comparisonRoundCode: 'ROUND_A2', noteAr: null, noteHe: null }],
  participation: [{ sourceSheet: 'Participation', sourceRow: 2, segmentCode: 'SCHOOL', participantCount: 10, eligibleCount: 12, responseRate: 83.33 }],
});

const input = (fixture: Fixture, workbook = validWorkbook(), overrides: Partial<SurveyExcelSemanticPreviewInput> = {}): SurveyExcelSemanticPreviewInput => ({
  institutionId: fixture.institutionAId,
  surveyId: fixture.surveyAId,
  roundId: fixture.roundA1Id,
  workbook,
  ...overrides,
});

async function resultCounts(surveyIds: string[]): Promise<number[]> {
  const where = { surveyId: { in: surveyIds } };
  return Promise.all([
    admin.surveyImportBatch.count({ where }),
    admin.surveyIndicatorResult.count({ where }),
    admin.surveyDomainResult.count({ where }),
    admin.surveyDomainComparison.count({ where }),
    admin.surveyParticipationResult.count({ where }),
  ]);
}

async function cleanup(): Promise<void> {
  if (created.segments.length) await admin.surveySegment.deleteMany({ where: { id: { in: created.segments } } });
  if (created.rounds.length) await admin.surveyRound.deleteMany({ where: { id: { in: created.rounds } } });
  if (created.indicators.length) await admin.surveyIndicator.deleteMany({ where: { id: { in: created.indicators } } });
  if (created.domains.length) await admin.surveyDomain.deleteMany({ where: { id: { in: created.domains } } });
  if (created.sections.length) await admin.surveySection.deleteMany({ where: { id: { in: created.sections } } });
  if (created.surveys.length) await admin.survey.deleteMany({ where: { id: { in: created.surveys } } });
  if (created.years.length) await admin.academicYear.deleteMany({ where: { id: { in: created.years } } });
  if (created.institutions.length) await admin.institution.deleteMany({ where: { id: { in: created.institutions } } });
}

test('survey Excel semantic preview resolves only tenant-owned structure and performs no writes', async (t) => {
  assert.notEqual(process.env['NODE_ENV'], 'production', 'Integration fixtures are disabled in production.');
  const runtimeUrl = process.env['RLS_RUNTIME_DATABASE_URL'];
  assert.ok(runtimeUrl, 'RLS_RUNTIME_DATABASE_URL must target school_app.');
  const runtime = new PrismaClient({ datasourceUrl: runtimeUrl });
  const role = (await runtime.$queryRawUnsafe<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>>('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'))[0];
  await runtime.$disconnect();
  assert.deepEqual(role, { current_user: 'school_app', rolsuper: false, rolbypassrls: false });

  let fixture: Fixture | undefined;
  try {
    fixture = await createFixture();
    const surveyIds = [fixture.surveyAId, fixture.archivedSurveyAId, fixture.surveyBId];
    const before = await resultCounts(surveyIds);

    await t.test('valid rows resolve to the exact survey, year, round, structure, and segment IDs', async () => {
      const result = await previewSurveyExcelSemantics(input(fixture!));
      assert.deepEqual(result.errors, []);
      assert.equal(result.survey?.id, fixture!.surveyAId);
      assert.equal(result.round?.id, fixture!.roundA1Id);
      assert.deepEqual(result.summary, { indicatorRowsTotal: 1, indicatorRowsValid: 1, domainRowsTotal: 1, domainRowsValid: 1, comparisonRowsTotal: 1, comparisonRowsValid: 1, participationRowsTotal: 1, participationRowsValid: 1, errorCount: 0 });
      assert.deepEqual({ sectionId: result.indicatorResults[0].sectionId, domainId: result.indicatorResults[0].domainId, indicatorId: result.indicatorResults[0].indicatorId, segmentId: result.indicatorResults[0].segmentId }, { sectionId: fixture!.sectionAId, domainId: fixture!.domainAId, indicatorId: fixture!.indicatorAId, segmentId: fixture!.schoolSegmentAId });
      assert.equal(result.indicatorResults[0].academicYearId, fixture!.yearAId);
      assert.equal(result.domainResults[0].scorePercentage, 73, 'Domain score must remain the independently imported value.');
      assert.equal(result.domainResults[0].segmentId, fixture!.gradeSegmentAId);
      assert.equal(result.comparisons[0].comparisonRoundId, fixture!.roundA2Id);
      assert.equal(result.participation[0].participantCount, 10);
    });

    await t.test('unknown indicator code is reported at its source row', async () => {
      const workbook = validWorkbook();
      workbook.indicatorResults[0].indicatorCode = 'UNKNOWN_INDICATOR';
      const result = await previewSurveyExcelSemantics(input(fixture!, workbook));
      assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_INDICATOR_CODE' && error.sheet === 'IndicatorResults' && error.row === 2 && error.column === 'indicatorCode'));
    });

    await t.test('unknown domain code is reported in each affected sheet', async () => {
      const workbook = validWorkbook();
      workbook.domainResults[0].domainCode = 'UNKNOWN_DOMAIN';
      workbook.comparisons[0].domainCode = 'UNKNOWN_DOMAIN';
      const result = await previewSurveyExcelSemantics(input(fixture!, workbook));
      assert.equal(result.errors.filter((error) => error.code === 'UNKNOWN_DOMAIN_CODE').length, 2);
    });

    await t.test('unknown segment code is reported', async () => {
      const workbook = validWorkbook();
      workbook.participation[0].segmentCode = 'UNKNOWN_SEGMENT';
      const result = await previewSurveyExcelSemantics(input(fixture!, workbook));
      assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_SEGMENT_CODE' && error.sheet === 'Participation'));
    });

    await t.test('unknown comparison round code is reported', async () => {
      const workbook = validWorkbook();
      workbook.comparisons[0].comparisonRoundCode = 'UNKNOWN_ROUND';
      const result = await previewSurveyExcelSemantics(input(fixture!, workbook));
      assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_COMPARISON_ROUND_CODE' && error.column === 'comparisonRoundCode'));
    });

    await t.test('codes that exist only in another tenant remain unknown', async () => {
      const workbook = validWorkbook();
      workbook.indicatorResults[0].indicatorCode = 'FOREIGN_INDICATOR';
      workbook.domainResults[0].domainCode = 'FOREIGN_DOMAIN';
      workbook.comparisons[0].domainCode = 'FOREIGN_DOMAIN';
      workbook.comparisons[0].comparisonRoundCode = 'ROUND_B';
      workbook.participation[0].segmentCode = 'FOREIGN_SEGMENT';
      const result = await previewSurveyExcelSemantics(input(fixture!, workbook));
      assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_INDICATOR_CODE'));
      assert.equal(result.errors.filter((error) => error.code === 'UNKNOWN_DOMAIN_CODE').length, 2);
      assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_SEGMENT_CODE'));
      assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_COMPARISON_ROUND_CODE'));
    });

    await t.test('foreign survey ID is hidden by tenant context', async () => {
      const result = await previewSurveyExcelSemantics(input(fixture!, validWorkbook(), { surveyId: fixture!.surveyBId }));
      assert.deepEqual(result.errors.map((error) => error.code), ['SURVEY_NOT_FOUND']);
      assert.equal(result.survey, null);
    });

    await t.test('round from another survey or tenant is hidden without disclosure', async () => {
      const result = await previewSurveyExcelSemantics(input(fixture!, validWorkbook(), { roundId: fixture!.roundBId }));
      assert.deepEqual(result.errors.map((error) => error.code), ['SURVEY_ROUND_NOT_FOUND']);
      assert.equal(result.round, null);
    });

    await t.test('another round owned by the same survey is a valid target context', async () => {
      const result = await previewSurveyExcelSemantics(input(fixture!, validWorkbook(), { roundId: fixture!.roundA2Id }));
      assert.equal(result.round?.id, fixture!.roundA2Id);
      assert.deepEqual(result.errors, []);
    });

    await t.test('archived survey is rejected before row resolution', async () => {
      const result = await previewSurveyExcelSemantics(input(fixture!, validWorkbook(), { surveyId: fixture!.archivedSurveyAId }));
      assert.deepEqual(result.errors.map((error) => error.code), ['SURVEY_ARCHIVED']);
      assert.equal(result.errors[0].scope, 'CONTEXT');
      assert.equal(result.summary.indicatorRowsValid, 0);
    });

    await t.test('all row-level semantic errors accumulate in one preview', async () => {
      const workbook = validWorkbook();
      workbook.indicatorResults[0].indicatorCode = 'MISSING_INDICATOR';
      workbook.indicatorResults[0].segmentCode = 'MISSING_SEGMENT';
      workbook.domainResults[0].domainCode = 'MISSING_DOMAIN';
      workbook.domainResults[0].segmentCode = 'MISSING_SEGMENT';
      workbook.comparisons[0].domainCode = 'MISSING_DOMAIN';
      workbook.comparisons[0].segmentCode = 'MISSING_SEGMENT';
      workbook.comparisons[0].comparisonType = 'UNSUPPORTED';
      workbook.comparisons[0].comparisonRoundCode = 'MISSING_ROUND';
      workbook.participation[0].segmentCode = 'MISSING_SEGMENT';
      const result = await previewSurveyExcelSemantics(input(fixture!, workbook));
      assert.equal(result.errors.length, 9);
      assert.ok(result.errors.every((error) => error.scope === 'ROW'));
      assert.deepEqual([result.summary.indicatorRowsValid, result.summary.domainRowsValid, result.summary.comparisonRowsValid, result.summary.participationRowsValid], [0, 0, 0, 0]);
    });

    await t.test('preview leaves every import and result table count unchanged', async () => {
      const after = await resultCounts(surveyIds);
      assert.deepEqual(after, before);
    });
  } finally {
    await cleanup();
    await admin.$disconnect();
    await prisma.$disconnect();
  }
});
