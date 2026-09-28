import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import {
  executeSurveyExcelImport,
  mapSurveyImportConstraintError,
  SURVEY_IMPORT_BATCH_STATUSES,
  SurveyExcelImportError,
} from './surveys-excel.import';
import { sha256SurveyExcelFile } from './surveys-excel.preflight';
import { previewSurveyExcelSemantics } from './surveys-excel.semantic';
import type { SurveyExcelImportInput, SurveyExcelSemanticPreview, SurveyExcelValidatedWorkbook } from './surveys-excel.types';

type Fixture = {
  institutionAId: string;
  institutionBId: string;
  yearAId: string;
  yearBId: string;
  userId: string;
  surveyAId: string;
  archivedSurveyAId: string;
  surveyBId: string;
  successRoundId: string;
  otherRoundId: string;
  existingRoundId: string;
  rollbackRoundId: string;
  spareRoundId: string;
  comparisonRoundId: string;
  archivedRoundId: string;
  roundBId: string;
  sectionAId: string;
  domainAId: string;
  indicatorAId: string;
  segmentAId: string;
};

const created = {
  institutions: [] as string[],
  years: [] as string[],
  users: [] as string[],
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
  const institutionA = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `survey-import-a-${marker}`, nameAr: 'Import A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `survey-import-b-${marker}`, nameAr: 'Import B', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  created.institutions.push(institutionA.id, institutionB.id);
  const yearA = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `A-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const yearB = await admin.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `B-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  created.years.push(yearA.id, yearB.id);
  const email = `survey-import-${marker}@fixture.test`;
  const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } });
  created.users.push(user.id);

  const surveyA = await admin.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'Survey A' } });
  const archivedSurveyA = await admin.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'Archived A', archivedAt: new Date() } });
  const surveyB = await admin.survey.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: 'Survey B' } });
  created.surveys.push(surveyA.id, archivedSurveyA.id, surveyB.id);
  const sectionA = await admin.surveySection.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SECTION_A', nameAr: 'Section A' } });
  const domainA = await admin.surveyDomain.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, sectionId: sectionA.id, code: 'DOMAIN_A', nameAr: 'Domain A' } });
  const indicatorA = await admin.surveyIndicator.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, domainId: domainA.id, code: 'INDICATOR_A', textAr: 'Indicator A', reportingRuleCode: 'DIRECT_PERCENT' } });
  const segmentA = await admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SCHOOL', nameAr: 'School' } });
  created.sections.push(sectionA.id);
  created.domains.push(domainA.id);
  created.indicators.push(indicatorA.id);
  created.segments.push(segmentA.id);

  const round = (surveyId: string, institutionId: string, academicYearId: string, code: string, sequenceNumber: number) => admin.surveyRound.create({
    data: { institutionId, academicYearId, surveyId, code, nameAr: code, sequenceNumber },
  });
  const [successRound, otherRound, existingRound, rollbackRound, spareRound, comparisonRound, archivedRound, roundB] = await Promise.all([
    round(surveyA.id, institutionA.id, yearA.id, 'SUCCESS', 1),
    round(surveyA.id, institutionA.id, yearA.id, 'OTHER', 2),
    round(surveyA.id, institutionA.id, yearA.id, 'EXISTING', 3),
    round(surveyA.id, institutionA.id, yearA.id, 'ROLLBACK', 4),
    round(surveyA.id, institutionA.id, yearA.id, 'SPARE', 5),
    round(surveyA.id, institutionA.id, yearA.id, 'COMPARE', 6),
    round(archivedSurveyA.id, institutionA.id, yearA.id, 'ARCHIVED', 1),
    round(surveyB.id, institutionB.id, yearB.id, 'FOREIGN', 1),
  ]);
  created.rounds.push(successRound.id, otherRound.id, existingRound.id, rollbackRound.id, spareRound.id, comparisonRound.id, archivedRound.id, roundB.id);

  return {
    institutionAId: institutionA.id,
    institutionBId: institutionB.id,
    yearAId: yearA.id,
    yearBId: yearB.id,
    userId: user.id,
    surveyAId: surveyA.id,
    archivedSurveyAId: archivedSurveyA.id,
    surveyBId: surveyB.id,
    successRoundId: successRound.id,
    otherRoundId: otherRound.id,
    existingRoundId: existingRound.id,
    rollbackRoundId: rollbackRound.id,
    spareRoundId: spareRound.id,
    comparisonRoundId: comparisonRound.id,
    archivedRoundId: archivedRound.id,
    roundBId: roundB.id,
    sectionAId: sectionA.id,
    domainAId: domainA.id,
    indicatorAId: indicatorA.id,
    segmentAId: segmentA.id,
  };
}

const workbook = (): SurveyExcelValidatedWorkbook => ({
  indicatorResults: [{ sourceSheet: 'IndicatorResults', sourceRow: 2, indicatorCode: 'INDICATOR_A', segmentCode: 'SCHOOL', reportedPercentage: 0, respondentCount: 0, earnedTotal: null, possibleTotal: null }],
  domainResults: [{ sourceSheet: 'DomainResults', sourceRow: 2, domainCode: 'DOMAIN_A', segmentCode: 'SCHOOL', scorePercentage: null, respondentCount: 0, isComparable: false }],
  comparisons: [{ sourceSheet: 'Comparisons', sourceRow: 2, domainCode: 'DOMAIN_A', segmentCode: 'SCHOOL', comparisonType: 'PREVIOUS_ROUND', comparisonCode: null, comparisonValue: 0, comparisonRoundCode: 'COMPARE', noteAr: null, noteHe: 'note' }],
  participation: [{ sourceSheet: 'Participation', sourceRow: 2, segmentCode: 'SCHOOL', participantCount: 0, eligibleCount: null, responseRate: 0 }],
});

const emptyWorkbook = (): SurveyExcelValidatedWorkbook => ({ indicatorResults: [], domainResults: [], comparisons: [], participation: [] });
const bytes = Buffer.from('atomic-survey-import-file');

async function preview(f: Fixture, roundId: string, value = workbook()): Promise<SurveyExcelSemanticPreview> {
  return previewSurveyExcelSemantics({ institutionId: f.institutionAId, surveyId: f.surveyAId, roundId, workbook: value });
}

function input(f: Fixture, roundId: string, semanticPreview: SurveyExcelSemanticPreview, overrides: Partial<SurveyExcelImportInput> = {}): SurveyExcelImportInput {
  return {
    institutionId: f.institutionAId,
    surveyId: f.surveyAId,
    roundId,
    userId: f.userId,
    originalFileName: 'survey-results.xlsx',
    fileBuffer: bytes,
    preview: semanticPreview,
    ...overrides,
  };
}

async function roundCounts(roundId: string): Promise<number[]> {
  const where = { roundId };
  return Promise.all([
    admin.surveyImportBatch.count({ where }),
    admin.surveyIndicatorResult.count({ where }),
    admin.surveyDomainResult.count({ where }),
    admin.surveyDomainComparison.count({ where }),
    admin.surveyParticipationResult.count({ where }),
  ]);
}

async function expectImportError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof SurveyExcelImportError && error.code === code);
}

async function cleanup(): Promise<void> {
  const surveyWhere = { surveyId: { in: created.surveys } };
  await admin.surveyIndicatorResult.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyDomainResult.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyDomainComparison.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyParticipationResult.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.surveyImportBatch.deleteMany({ where: surveyWhere }).catch(() => undefined);
  await admin.auditLog.deleteMany({ where: { institutionId: { in: created.institutions } } }).catch(() => undefined);
  if (created.segments.length) await admin.surveySegment.deleteMany({ where: { id: { in: created.segments } } }).catch(() => undefined);
  if (created.rounds.length) await admin.surveyRound.deleteMany({ where: { id: { in: created.rounds } } }).catch(() => undefined);
  if (created.indicators.length) await admin.surveyIndicator.deleteMany({ where: { id: { in: created.indicators } } }).catch(() => undefined);
  if (created.domains.length) await admin.surveyDomain.deleteMany({ where: { id: { in: created.domains } } }).catch(() => undefined);
  if (created.sections.length) await admin.surveySection.deleteMany({ where: { id: { in: created.sections } } }).catch(() => undefined);
  if (created.surveys.length) await admin.survey.deleteMany({ where: { id: { in: created.surveys } } }).catch(() => undefined);
  if (created.years.length) await admin.academicYear.deleteMany({ where: { id: { in: created.years } } }).catch(() => undefined);
  if (created.users.length) await admin.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => undefined);
  if (created.institutions.length) await admin.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => undefined);
}

test('survey Excel execution imports all aggregate results atomically under tenant RLS', async (t) => {
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
    const successPreview = await preview(f, f.successRoundId);
    assert.deepEqual(successPreview.errors, []);

    await t.test('successful import stores one completed batch, all four result types, exact values, relations, and audit', async () => {
      const result = await executeSurveyExcelImport(input(f, f.successRoundId, successPreview));
      assert.deepEqual({ status: result.status, rowCount: result.rowCount, validRowCount: result.validRowCount, invalidRowCount: result.invalidRowCount }, { status: 'COMPLETED', rowCount: 4, validRowCount: 4, invalidRowCount: 0 });
      assert.equal(result.fileHash, sha256SurveyExcelFile(bytes));
      assert.ok(result.importedAt instanceof Date);

      const batch = await admin.surveyImportBatch.findUniqueOrThrow({ where: { id: result.importBatchId } });
      assert.equal(batch.status, SURVEY_IMPORT_BATCH_STATUSES.COMPLETED);
      assert.equal(batch.originalFileName, 'survey-results.xlsx');
      assert.equal(batch.fileHash, sha256SurveyExcelFile(bytes));
      assert.equal(batch.importedByUserId, f.userId);
      assert.deepEqual([batch.rowCount, batch.validRowCount, batch.invalidRowCount], [4, 4, 0]);
      assert.ok(batch.importedAt);

      const [indicator, domain, comparison, participation] = await Promise.all([
        admin.surveyIndicatorResult.findFirstOrThrow({ where: { roundId: f.successRoundId } }),
        admin.surveyDomainResult.findFirstOrThrow({ where: { roundId: f.successRoundId } }),
        admin.surveyDomainComparison.findFirstOrThrow({ where: { roundId: f.successRoundId } }),
        admin.surveyParticipationResult.findFirstOrThrow({ where: { roundId: f.successRoundId } }),
      ]);
      const common = { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.successRoundId, segmentId: f.segmentAId };
      for (const row of [indicator, domain, comparison, participation]) {
        assert.equal(row.institutionId, common.institutionId);
        assert.equal(row.academicYearId, common.academicYearId);
        assert.equal(row.surveyId, common.surveyId);
        assert.equal(row.roundId, common.roundId);
        assert.equal(row.segmentId, common.segmentId);
      }
      assert.equal(indicator.sectionId, f.sectionAId);
      assert.equal(indicator.domainId, f.domainAId);
      assert.equal(indicator.indicatorId, f.indicatorAId);
      assert.equal(indicator.importBatchId, batch.id);
      assert.equal(indicator.reportedPercentage?.toNumber(), 0);
      assert.equal(indicator.respondentCount, 0);
      assert.equal(indicator.earnedTotal, null);
      assert.equal(indicator.possibleTotal, null);
      assert.equal(domain.domainId, f.domainAId);
      assert.equal(domain.importBatchId, batch.id);
      assert.equal(domain.scorePercentage, null);
      assert.equal(domain.respondentCount, 0);
      assert.equal(domain.isComparable, false);
      assert.equal(comparison.domainId, f.domainAId);
      assert.equal(comparison.comparisonRoundId, f.comparisonRoundId);
      assert.equal(comparison.comparisonCode, null);
      assert.equal(comparison.comparisonValue?.toNumber(), 0);
      assert.equal(comparison.noteAr, null);
      assert.equal(comparison.noteHe, 'note');
      assert.equal(participation.importBatchId, batch.id);
      assert.equal(participation.participantCount, 0);
      assert.equal(participation.eligibleCount, null);
      assert.equal(participation.responseRate?.toNumber(), 0);

      const audit = await admin.auditLog.findFirstOrThrow({ where: { institutionId: f.institutionAId, action: 'SURVEY_RESULTS_IMPORTED', entityType: 'SurveyImportBatch', entityId: batch.id } });
      assert.equal(audit.actorUserId, f.userId);
    });

    await t.test('same file and same round uses duplicate-file precedence and writes nothing', async () => {
      const before = await roundCounts(f.successRoundId);
      await expectImportError(executeSurveyExcelImport(input(f, f.successRoundId, successPreview)), 'SURVEY_IMPORT_DUPLICATE_FILE');
      assert.deepEqual(await roundCounts(f.successRoundId), before);
    });

    await t.test('different file and same round reports existing results and writes nothing', async () => {
      const before = await roundCounts(f.successRoundId);
      await expectImportError(executeSurveyExcelImport(input(f, f.successRoundId, successPreview, { fileBuffer: Buffer.from('different-file') })), 'SURVEY_ROUND_RESULTS_ALREADY_EXIST');
      assert.deepEqual(await roundCounts(f.successRoundId), before);
    });

    await t.test('same file hash is allowed for another round in the same survey', async () => {
      const otherPreview = await preview(f, f.otherRoundId);
      const result = await executeSurveyExcelImport(input(f, f.otherRoundId, otherPreview));
      assert.equal(result.status, 'COMPLETED');
      assert.equal(result.fileHash, sha256SurveyExcelFile(bytes));
      assert.deepEqual(await roundCounts(f.otherRoundId), [1, 1, 1, 1, 1]);
    });

    await t.test('a pre-existing result blocks execution before batch creation', async () => {
      const existingPreview = await preview(f, f.existingRoundId);
      const seeded = await admin.surveyIndicatorResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.existingRoundId, sectionId: f.sectionAId, domainId: f.domainAId, indicatorId: f.indicatorAId, segmentId: f.segmentAId, reportedPercentage: 40 } });
      try {
        await expectImportError(executeSurveyExcelImport(input(f, f.existingRoundId, existingPreview, { fileBuffer: Buffer.from('existing-result-file') })), 'SURVEY_ROUND_RESULTS_ALREADY_EXIST');
        assert.deepEqual(await roundCounts(f.existingRoundId), [0, 1, 0, 0, 0]);
      } finally {
        await admin.surveyIndicatorResult.delete({ where: { id: seeded.id } });
      }
    });

    await t.test('invalid preview and empty import are rejected before any writes', async () => {
      const invalidPreview: SurveyExcelSemanticPreview = { ...await preview(f, f.spareRoundId), errors: [{ sheet: 'IndicatorResults', row: 2, column: 'indicatorCode', code: 'UNKNOWN_INDICATOR_CODE', message: 'Unknown.', scope: 'ROW' }], summary: { ...(await preview(f, f.spareRoundId)).summary, errorCount: 1 } };
      await expectImportError(executeSurveyExcelImport(input(f, f.spareRoundId, invalidPreview)), 'SURVEY_IMPORT_PREVIEW_INVALID');
      const emptyPreview = await preview(f, f.spareRoundId, emptyWorkbook());
      await expectImportError(executeSurveyExcelImport(input(f, f.spareRoundId, emptyPreview)), 'SURVEY_IMPORT_EMPTY');
      assert.deepEqual(await roundCounts(f.spareRoundId), [0, 0, 0, 0, 0]);
    });

    await t.test('archived, foreign-survey, and mismatched-round execution preserve hidden context and write zero rows', async () => {
      const archivedPreview: SurveyExcelSemanticPreview = { ...successPreview, survey: { ...successPreview.survey!, id: f.archivedSurveyAId, archivedAt: new Date() } };
      await expectImportError(executeSurveyExcelImport(input(f, f.archivedRoundId, archivedPreview, { surveyId: f.archivedSurveyAId })), 'SURVEY_ARCHIVED');
      await expectImportError(executeSurveyExcelImport(input(f, f.successRoundId, successPreview, { surveyId: f.surveyBId, roundId: f.roundBId, fileBuffer: Buffer.from('foreign-file') })), 'SURVEY_NOT_FOUND');
      await expectImportError(executeSurveyExcelImport(input(f, f.roundBId, successPreview, { fileBuffer: Buffer.from('mismatched-round-file') })), 'SURVEY_ROUND_NOT_FOUND');
      assert.deepEqual(await roundCounts(f.archivedRoundId), [0, 0, 0, 0, 0]);
      assert.deepEqual(await roundCounts(f.roundBId), [0, 0, 0, 0, 0]);
    });

    await t.test('a deterministic participation FK failure rolls back batch and every earlier result insert', async () => {
      const rollbackPreview = await preview(f, f.rollbackRoundId);
      const brokenPreview: SurveyExcelSemanticPreview = {
        ...rollbackPreview,
        participation: rollbackPreview.participation.map((row) => ({ ...row, segmentId: randomUUID() })),
      };
      await assert.rejects(executeSurveyExcelImport(input(f, f.rollbackRoundId, brokenPreview, { fileBuffer: Buffer.from('rollback-file') })), (error: any) => error?.code === 'P2003');
      assert.deepEqual(await roundCounts(f.rollbackRoundId), [0, 0, 0, 0, 0]);
      assert.equal(await admin.auditLog.count({ where: { institutionId: f.institutionAId, action: 'SURVEY_RESULTS_IMPORTED', metadata: { path: ['roundId'], equals: f.rollbackRoundId } } }), 0);
    });

    await t.test('savepoint rollback remains atomic when a request transaction catches the service error', async () => {
      const rollbackPreview = await preview(f, f.rollbackRoundId);
      const brokenPreview: SurveyExcelSemanticPreview = {
        ...rollbackPreview,
        participation: rollbackPreview.participation.map((row) => ({ ...row, segmentId: randomUUID() })),
      };
      await withRlsContext(f.institutionAId, async () => {
        await assert.rejects(executeSurveyExcelImport(input(f, f.rollbackRoundId, brokenPreview, { fileBuffer: Buffer.from('nested-rollback-file') })), (error: any) => error?.code === 'P2003');
        const where = { roundId: f.rollbackRoundId };
        assert.deepEqual(await Promise.all([
          prisma.surveyImportBatch.count({ where }), prisma.surveyIndicatorResult.count({ where }), prisma.surveyDomainResult.count({ where }),
          prisma.surveyDomainComparison.count({ where }), prisma.surveyParticipationResult.count({ where }),
        ]), [0, 0, 0, 0, 0]);
      });
      assert.deepEqual(await roundCounts(f.rollbackRoundId), [0, 0, 0, 0, 0]);
    });

    await t.test('known unique constraints map selectively while unknown conflicts stay unchanged', () => {
      const duplicate = mapSurveyImportConstraintError(new Prisma.PrismaClientKnownRequestError('duplicate batch', {
        code: 'P2002', clientVersion: 'test', meta: { modelName: 'SurveyImportBatch', target: ['institutionId', 'surveyId', 'roundId', 'fileHash'] },
      }));
      const result = mapSurveyImportConstraintError(new Prisma.PrismaClientKnownRequestError('duplicate result', {
        code: 'P2002', clientVersion: 'test', meta: { modelName: 'SurveyIndicatorResult', target: ['roundId', 'indicatorId', 'segmentId'] },
      }));
      const unknown = mapSurveyImportConstraintError({ code: '23505', constraint: 'unrelated_unique_key' });
      assert.equal(duplicate?.code, 'SURVEY_IMPORT_DUPLICATE_FILE');
      assert.equal(result?.code, 'SURVEY_ROUND_RESULTS_ALREADY_EXIST');
      assert.equal(unknown, undefined);
    });
  } finally {
    await cleanup();
    await admin.$disconnect();
    await prisma.$disconnect();
  }
});
