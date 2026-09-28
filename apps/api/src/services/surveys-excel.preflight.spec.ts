import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { hasSurveyRoundResults, preflightSurveyExcelImport, sha256SurveyExcelFile } from './surveys-excel.preflight';
import { previewSurveyExcelSemantics } from './surveys-excel.semantic';
import type { SurveyExcelImportPreflightInput, SurveyExcelSemanticPreview, SurveyExcelValidatedWorkbook } from './surveys-excel.types';

type Fixture = {
  institutionAId: string;
  institutionBId: string;
  yearAId: string;
  yearBId: string;
  surveyAId: string;
  archivedSurveyAId: string;
  surveyBId: string;
  roundA1Id: string;
  roundA2Id: string;
  archivedRoundAId: string;
  roundBId: string;
  sectionAId: string;
  sectionBId: string;
  domainAId: string;
  domainBId: string;
  indicatorAId: string;
  indicatorBId: string;
  segmentAId: string;
  segmentBId: string;
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
  const institutionA = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `survey-preflight-a-${marker}`, nameAr: 'Preflight A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `survey-preflight-b-${marker}`, nameAr: 'Preflight B', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
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
  const domainB = await admin.surveyDomain.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, sectionId: sectionB.id, code: 'DOMAIN_B', nameAr: 'Domain B' } });
  created.domains.push(domainA.id, domainB.id);
  const indicatorA = await admin.surveyIndicator.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, domainId: domainA.id, code: 'INDICATOR_A', textAr: 'Indicator A', reportingRuleCode: 'DIRECT_PERCENT' } });
  const indicatorB = await admin.surveyIndicator.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, domainId: domainB.id, code: 'INDICATOR_B', textAr: 'Indicator B', reportingRuleCode: 'DIRECT_PERCENT' } });
  created.indicators.push(indicatorA.id, indicatorB.id);

  const roundA1 = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: 'ROUND_A1', nameAr: 'Round A1', sequenceNumber: 1 } });
  const roundA2 = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: 'ROUND_A2', nameAr: 'Round A2', sequenceNumber: 2 } });
  const archivedRoundA = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: archivedSurveyA.id, code: 'ARCHIVED_ROUND', nameAr: 'Archived Round', sequenceNumber: 1 } });
  const roundB = await admin.surveyRound.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, surveyId: surveyB.id, code: 'ROUND_B', nameAr: 'Round B', sequenceNumber: 1 } });
  created.rounds.push(roundA1.id, roundA2.id, archivedRoundA.id, roundB.id);
  const segmentA = await admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SCHOOL', nameAr: 'School A' } });
  const segmentB = await admin.surveySegment.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'SCHOOL', nameAr: 'School B' } });
  created.segments.push(segmentA.id, segmentB.id);

  return {
    institutionAId: institutionA.id,
    institutionBId: institutionB.id,
    yearAId: yearA.id,
    yearBId: yearB.id,
    surveyAId: surveyA.id,
    archivedSurveyAId: archivedSurveyA.id,
    surveyBId: surveyB.id,
    roundA1Id: roundA1.id,
    roundA2Id: roundA2.id,
    archivedRoundAId: archivedRoundA.id,
    roundBId: roundB.id,
    sectionAId: sectionA.id,
    sectionBId: sectionB.id,
    domainAId: domainA.id,
    domainBId: domainB.id,
    indicatorAId: indicatorA.id,
    indicatorBId: indicatorB.id,
    segmentAId: segmentA.id,
    segmentBId: segmentB.id,
  };
}

const validWorkbook = (): SurveyExcelValidatedWorkbook => ({
  indicatorResults: [{ sourceSheet: 'IndicatorResults', sourceRow: 2, indicatorCode: 'INDICATOR_A', segmentCode: 'SCHOOL', reportedPercentage: 81, respondentCount: 10, earnedTotal: null, possibleTotal: null }],
  domainResults: [{ sourceSheet: 'DomainResults', sourceRow: 2, domainCode: 'DOMAIN_A', segmentCode: 'SCHOOL', scorePercentage: 73, respondentCount: 8, isComparable: true }],
  comparisons: [{ sourceSheet: 'Comparisons', sourceRow: 2, domainCode: 'DOMAIN_A', segmentCode: 'SCHOOL', comparisonType: 'PREVIOUS_ROUND', comparisonCode: null, comparisonValue: 69, comparisonRoundCode: 'ROUND_A2', noteAr: null, noteHe: null }],
  participation: [{ sourceSheet: 'Participation', sourceRow: 2, segmentCode: 'SCHOOL', participantCount: 10, eligibleCount: 12, responseRate: 83.33 }],
});

const fileBuffer = Buffer.from('survey-preflight-xlsx-bytes');

const preflightInput = (fixture: Fixture, preview: SurveyExcelSemanticPreview, overrides: Partial<SurveyExcelImportPreflightInput> = {}): SurveyExcelImportPreflightInput => ({
  institutionId: fixture.institutionAId,
  surveyId: fixture.surveyAId,
  roundId: fixture.roundA1Id,
  fileBuffer,
  preview,
  ...overrides,
});

async function counts(surveyIds: string[]): Promise<number[]> {
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
  const surveyWhere = { surveyId: { in: created.surveys } };
  await admin.surveyIndicatorResult.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyDomainResult.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyDomainComparison.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyParticipationResult.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyImportBatch.deleteMany({ where: surveyWhere }).catch(() => undefined);
  if (created.segments.length) await admin.surveySegment.deleteMany({ where: { id: { in: created.segments } } }).catch(() => undefined);
  if (created.rounds.length) await admin.surveyRound.deleteMany({ where: { id: { in: created.rounds } } }).catch(() => undefined);
  if (created.indicators.length) await admin.surveyIndicator.deleteMany({ where: { id: { in: created.indicators } } }).catch(() => undefined);
  if (created.domains.length) await admin.surveyDomain.deleteMany({ where: { id: { in: created.domains } } }).catch(() => undefined);
  if (created.sections.length) await admin.surveySection.deleteMany({ where: { id: { in: created.sections } } }).catch(() => undefined);
  if (created.surveys.length) await admin.survey.deleteMany({ where: { id: { in: created.surveys } } }).catch(() => undefined);
  if (created.years.length) await admin.academicYear.deleteMany({ where: { id: { in: created.years } } }).catch(() => undefined);
  if (created.institutions.length) await admin.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => undefined);
}

function assertBlocked(result: Awaited<ReturnType<typeof preflightSurveyExcelImport>>): void {
  assert.equal(result.hasExistingResults, true);
  assert.equal(result.canImport, false);
  assert.deepEqual(result.errors.map((error) => error.code), ['SURVEY_ROUND_RESULTS_ALREADY_EXIST']);
}

test('survey Excel import preflight is tenant-safe, insert-only, deterministic, and read-only', async (t) => {
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
    const f = fixture;
    const surveyIds = [f.surveyAId, f.archivedSurveyAId, f.surveyBId];
    const before = await counts(surveyIds);
    const validPreview = await previewSurveyExcelSemantics({ institutionId: f.institutionAId, surveyId: f.surveyAId, roundId: f.roundA1Id, workbook: validWorkbook() });
    assert.deepEqual(validPreview.errors, []);

    await t.test('A. valid preview and empty target round can import', async () => {
      assert.equal(await hasSurveyRoundResults({ institutionId: f.institutionAId, surveyId: f.surveyAId, roundId: f.roundA1Id }), false);
      const result = await preflightSurveyExcelImport(preflightInput(f, validPreview));
      assert.equal(result.canImport, true);
      assert.equal(result.hasExistingResults, false);
      assert.equal(result.academicYearId, f.yearAId);
      assert.deepEqual(result.errors, []);
    });

    await t.test('B. indicator result blocks import', async () => {
      const row = await admin.surveyIndicatorResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA1Id, sectionId: f.sectionAId, domainId: f.domainAId, indicatorId: f.indicatorAId, segmentId: f.segmentAId, reportedPercentage: 81 } });
      try {
        assert.equal(await hasSurveyRoundResults({ institutionId: f.institutionAId, surveyId: f.surveyAId, roundId: f.roundA1Id }), true);
        assertBlocked(await preflightSurveyExcelImport(preflightInput(f, validPreview)));
      } finally {
        await admin.surveyIndicatorResult.delete({ where: { id: row.id } });
      }
    });

    await t.test('C. domain result blocks import', async () => {
      const row = await admin.surveyDomainResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA1Id, domainId: f.domainAId, segmentId: f.segmentAId, scorePercentage: 73 } });
      try {
        assertBlocked(await preflightSurveyExcelImport(preflightInput(f, validPreview)));
      } finally {
        await admin.surveyDomainResult.delete({ where: { id: row.id } });
      }
    });

    await t.test('D. domain comparison blocks import', async () => {
      const row = await admin.surveyDomainComparison.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA1Id, domainId: f.domainAId, segmentId: f.segmentAId, comparisonType: 'PREVIOUS_ROUND', comparisonRoundId: f.roundA2Id, comparisonValue: 69 } });
      try {
        assertBlocked(await preflightSurveyExcelImport(preflightInput(f, validPreview)));
      } finally {
        await admin.surveyDomainComparison.delete({ where: { id: row.id } });
      }
    });

    await t.test('E. participation result blocks import', async () => {
      const row = await admin.surveyParticipationResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA1Id, segmentId: f.segmentAId, participantCount: 10 } });
      try {
        assertBlocked(await preflightSurveyExcelImport(preflightInput(f, validPreview)));
      } finally {
        await admin.surveyParticipationResult.delete({ where: { id: row.id } });
      }
    });

    await t.test('F. rows in multiple result tables still produce one conflict', async () => {
      const indicator = await admin.surveyIndicatorResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA1Id, sectionId: f.sectionAId, domainId: f.domainAId, indicatorId: f.indicatorAId, segmentId: f.segmentAId, reportedPercentage: 81 } });
      const domain = await admin.surveyDomainResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA1Id, domainId: f.domainAId, segmentId: f.segmentAId, scorePercentage: 73 } });
      try {
        assertBlocked(await preflightSurveyExcelImport(preflightInput(f, validPreview)));
      } finally {
        await admin.surveyIndicatorResult.delete({ where: { id: indicator.id } });
        await admin.surveyDomainResult.delete({ where: { id: domain.id } });
      }
    });

    await t.test('G. results in another round do not block the target round', async () => {
      const row = await admin.surveyIndicatorResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA2Id, sectionId: f.sectionAId, domainId: f.domainAId, indicatorId: f.indicatorAId, segmentId: f.segmentAId, reportedPercentage: 70 } });
      try {
        const result = await preflightSurveyExcelImport(preflightInput(f, validPreview));
        assert.equal(result.hasExistingResults, false);
        assert.equal(result.canImport, true);
      } finally {
        await admin.surveyIndicatorResult.delete({ where: { id: row.id } });
      }
    });

    await t.test('H. foreign tenant results do not affect the target', async () => {
      const row = await admin.surveyIndicatorResult.create({ data: { institutionId: f.institutionBId, academicYearId: f.yearBId, surveyId: f.surveyBId, roundId: f.roundBId, sectionId: f.sectionBId, domainId: f.domainBId, indicatorId: f.indicatorBId, segmentId: f.segmentBId, reportedPercentage: 55 } });
      try {
        const result = await preflightSurveyExcelImport(preflightInput(f, validPreview));
        assert.equal(result.hasExistingResults, false);
        assert.equal(result.canImport, true);
      } finally {
        await admin.surveyIndicatorResult.delete({ where: { id: row.id } });
      }
    });

    await t.test('I. archived survey preserves the semantic context contract', async () => {
      const preview: SurveyExcelSemanticPreview = {
        ...validPreview,
        survey: { ...validPreview.survey!, id: f.archivedSurveyAId, archivedAt: new Date() },
      };
      const result = await preflightSurveyExcelImport(preflightInput(f, preview, { surveyId: f.archivedSurveyAId, roundId: f.archivedRoundAId }));
      assert.equal(result.canImport, false);
      assert.deepEqual(result.errors.map((error) => error.code), ['SURVEY_ARCHIVED']);
    });

    await t.test('J. mismatched or foreign round remains hidden', async () => {
      const preview: SurveyExcelSemanticPreview = {
        ...validPreview,
        round: { ...validPreview.round!, id: f.roundBId },
      };
      const result = await preflightSurveyExcelImport(preflightInput(f, preview, { roundId: f.roundBId }));
      assert.equal(result.canImport, false);
      assert.deepEqual(result.errors.map((error) => error.code), ['SURVEY_ROUND_NOT_FOUND']);
    });

    await t.test('K. invalid semantic preview cannot import', async () => {
      const workbook = validWorkbook();
      workbook.indicatorResults[0].indicatorCode = 'UNKNOWN_INDICATOR';
      const preview = await previewSurveyExcelSemantics({ institutionId: f.institutionAId, surveyId: f.surveyAId, roundId: f.roundA1Id, workbook });
      const result = await preflightSurveyExcelImport(preflightInput(f, preview));
      assert.equal(result.canImport, false);
      assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_INDICATOR_CODE'));
    });

    await t.test('L. the same buffer has the same lowercase SHA-256', () => {
      const first = sha256SurveyExcelFile(fileBuffer);
      const second = sha256SurveyExcelFile(Buffer.from(fileBuffer));
      assert.equal(first, second);
      assert.match(first, /^[a-f0-9]{64}$/);
    });

    await t.test('M. changed bytes have a different SHA-256', () => {
      assert.notEqual(sha256SurveyExcelFile(fileBuffer), sha256SurveyExcelFile(Buffer.from('survey-preflight-xlsx-bytes-changed')));
    });

    await t.test('persisted file hash supports a read-only duplicate lookup', async () => {
      const fileHash = sha256SurveyExcelFile(fileBuffer);
      const batch = await admin.surveyImportBatch.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.roundA1Id, originalFileName: 'preflight.xlsx', fileHash } });
      try {
        const result = await preflightSurveyExcelImport(preflightInput(f, validPreview));
        assert.equal(result.duplicateImportFound, true);
        assert.equal(result.canImport, true);
      } finally {
        await admin.surveyImportBatch.delete({ where: { id: batch.id } });
      }
    });

    await t.test('N. preflight leaves import and result table counts unchanged', async () => {
      assert.deepEqual(await counts(surveyIds), before);
    });
  } finally {
    await cleanup();
    await admin.$disconnect();
    await prisma.$disconnect();
  }
});
