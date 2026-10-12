import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import ExcelJS from 'exceljs';
import app from '../server';
import { prisma } from '../db/prisma';
import { platformPrisma } from '../db/platform-prisma';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';
import { sha256SurveyExcelFile } from '../services/surveys-excel.preflight';
import { MAX_SURVEY_XLSX_ARCHIVE_ENTRIES } from '../services/surveys-excel.archive';
import { MAX_SURVEY_IMPORT_ROWS } from '../services/surveys-excel.parser';
import { XLSX_MIME } from './spreadsheet-security';

type Actor = { userId: string; token: string };
type Fixture = {
  institutionAId: string;
  yearAId: string;
  surveyAId: string;
  archivedSurveyAId: string;
  surveyBId: string;
  successRoundId: string;
  otherRoundId: string;
  existingRoundId: string;
  spareRoundId: string;
  comparisonRoundId: string;
  archivedRoundId: string;
  roundBId: string;
  sectionAId: string;
  domainAId: string;
  indicatorAId: string;
  segmentAId: string;
  readActor: Actor;
  updateActor: Actor;
};

const created = {
  institutions: [] as string[], years: [] as string[], surveys: [] as string[], sections: [] as string[], domains: [] as string[],
  indicators: [] as string[], rounds: [] as string[], segments: [] as string[], users: [] as string[], staff: [] as string[],
  memberships: [] as string[], roles: [] as string[],
};

async function createActor(institutionId: string, marker: string, permissionId: string): Promise<Actor> {
  const email = `${marker}-${randomUUID()}@fixture.test`;
  const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } });
  const staff = await admin.staffMember.create({ data: { institutionId, firstNameAr: marker, familyNameAr: 'Survey' } });
  const membership = await admin.institutionUser.create({ data: { institutionId, userId: user.id, staffMemberId: staff.id } });
  const role = await admin.role.create({ data: { institutionId, nameAr: `${marker}-${randomUUID()}` } });
  await admin.institutionUserRole.create({ data: { institutionId, institutionUserId: membership.id, roleId: role.id } });
  await admin.rolePermission.create({ data: { institutionId, roleId: role.id, permissionId } });
  created.users.push(user.id); created.staff.push(staff.id); created.memberships.push(membership.id); created.roles.push(role.id);
  return { userId: user.id, token: await createLocalAccessToken(user.id, email) };
}

async function createFixture(): Promise<Fixture> {
  const [type, region, status, language, readPermission, updatePermission] = await Promise.all([
    admin.educationType.findFirstOrThrow(), admin.region.findFirstOrThrow(), admin.institutionStatus.findFirstOrThrow(), admin.language.findFirstOrThrow(),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'READ' } } }),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } }),
  ]);
  const marker = randomUUID();
  const institutionA = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `survey-http-import-a-${marker}`, nameAr: 'Import A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `survey-http-import-b-${marker}`, nameAr: 'Import B', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  created.institutions.push(institutionA.id, institutionB.id);
  const yearA = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `A-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const yearB = await admin.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `B-${marker}`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  created.years.push(yearA.id, yearB.id);
  const surveyA = await admin.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'Survey A' } });
  const archivedSurveyA = await admin.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'Archived A', archivedAt: new Date() } });
  const surveyB = await admin.survey.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: 'Survey B' } });
  created.surveys.push(surveyA.id, archivedSurveyA.id, surveyB.id);
  const sectionA = await admin.surveySection.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SECTION_A', nameAr: 'Section A' } });
  const sectionB = await admin.surveySection.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'SECTION_B', nameAr: 'Section B' } });
  created.sections.push(sectionA.id, sectionB.id);
  const domainA = await admin.surveyDomain.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, sectionId: sectionA.id, code: 'DOMAIN_A', nameAr: 'Domain A' } });
  const domainB = await admin.surveyDomain.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, sectionId: sectionB.id, code: 'DOMAIN_B', nameAr: 'Domain B' } });
  created.domains.push(domainA.id, domainB.id);
  const indicatorA = await admin.surveyIndicator.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, domainId: domainA.id, code: 'INDICATOR_A', textAr: 'Indicator A' } });
  const indicatorB = await admin.surveyIndicator.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, domainId: domainB.id, code: 'INDICATOR_B', textAr: 'Indicator B' } });
  created.indicators.push(indicatorA.id, indicatorB.id);
  const segmentA = await admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SCHOOL', nameAr: 'School' } });
  const segmentB = await admin.surveySegment.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'SCHOOL', nameAr: 'School B' } });
  created.segments.push(segmentA.id, segmentB.id);
  const round = (surveyId: string, institutionId: string, academicYearId: string, code: string, sequenceNumber: number) => admin.surveyRound.create({ data: { institutionId, academicYearId, surveyId, code, nameAr: code, sequenceNumber } });
  const [successRound, otherRound, existingRound, spareRound, comparisonRound, archivedRound, roundB] = await Promise.all([
    round(surveyA.id, institutionA.id, yearA.id, 'SUCCESS', 1), round(surveyA.id, institutionA.id, yearA.id, 'OTHER', 2),
    round(surveyA.id, institutionA.id, yearA.id, 'EXISTING', 3), round(surveyA.id, institutionA.id, yearA.id, 'SPARE', 4),
    round(surveyA.id, institutionA.id, yearA.id, 'COMPARE', 5), round(archivedSurveyA.id, institutionA.id, yearA.id, 'ARCHIVED', 1),
    round(surveyB.id, institutionB.id, yearB.id, 'FOREIGN', 1),
  ]);
  created.rounds.push(successRound.id, otherRound.id, existingRound.id, spareRound.id, comparisonRound.id, archivedRound.id, roundB.id);
  const [readActor, updateActor] = await Promise.all([
    createActor(institutionA.id, 'read', readPermission.id), createActor(institutionA.id, 'update', updatePermission.id),
  ]);
  return {
    institutionAId: institutionA.id, yearAId: yearA.id, surveyAId: surveyA.id, archivedSurveyAId: archivedSurveyA.id, surveyBId: surveyB.id,
    successRoundId: successRound.id, otherRoundId: otherRound.id, existingRoundId: existingRound.id, spareRoundId: spareRound.id,
    comparisonRoundId: comparisonRound.id, archivedRoundId: archivedRound.id, roundBId: roundB.id,
    sectionAId: sectionA.id, domainAId: domainA.id, indicatorAId: indicatorA.id, segmentAId: segmentA.id, readActor, updateActor,
  };
}

async function workbookBuffer(options: { indicatorCode?: string; percentage?: number; segmentCode?: string; empty?: boolean; marker?: string; farCell?: string } = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.marker || 'stable-import';
  const sheets: Array<[string, string[], unknown[]]> = [
    ['IndicatorResults', ['indicatorCode', 'segmentCode', 'reportedPercentage', 'respondentCount', 'earnedTotal', 'possibleTotal'], [options.indicatorCode || 'INDICATOR_A', options.segmentCode || 'SCHOOL', options.percentage ?? 0, 0, null, null]],
    ['DomainResults', ['domainCode', 'segmentCode', 'scorePercentage', 'respondentCount', 'isComparable'], ['DOMAIN_A', options.segmentCode || 'SCHOOL', null, 0, false]],
    ['Comparisons', ['domainCode', 'segmentCode', 'comparisonType', 'comparisonCode', 'comparisonValue', 'comparisonRoundCode', 'noteAr', 'noteHe'], ['DOMAIN_A', options.segmentCode || 'SCHOOL', 'PREVIOUS_ROUND', null, 0, 'COMPARE', null, 'note']],
    ['Participation', ['segmentCode', 'participantCount', 'eligibleCount', 'responseRate'], [options.segmentCode || 'SCHOOL', 0, null, 0]],
  ];
  for (const [name, headers, row] of sheets) { const sheet = workbook.addWorksheet(name); sheet.addRow(headers); if (!options.empty) sheet.addRow(row); }
  if (options.farCell) workbook.getWorksheet('IndicatorResults')!.getCell(options.farCell).value = 'OUT_OF_BOUNDS';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function archiveBomb(kind: 'TOTAL' | 'SINGLE' | 'ENTRIES'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  if (kind === 'TOTAL') {
    const formula = `${'1+'.repeat(500)}1`;
    for (let index = 0; index < 3; index += 1) {
      const sheet = workbook.addWorksheet(`Sheet${index}`);
      for (let row = 0; row < 3_000; row += 1) sheet.addRow(Array.from({ length: 8 }, () => ({ formula })));
    }
  } else if (kind === 'SINGLE') {
    const sheet = workbook.addWorksheet('Sheet');
    for (let index = 0; index < 5_000; index += 1) sheet.addRow([`${String(index).padStart(5, '0')}_${'A'.repeat(10_990)}`]);
  } else {
    for (let index = 0; index <= MAX_SURVEY_XLSX_ARCHIVE_ENTRIES; index += 1) workbook.addWorksheet(`Sheet${index}`).addRow(['value']);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const formWithFile = (buffer: Uint8Array, fileName = 'school-results.xlsx'): FormData => {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(buffer).buffer], { type: XLSX_MIME }), fileName);
  return form;
};

async function counts(surveyIds: string[]): Promise<number[]> {
  const where = { surveyId: { in: surveyIds } };
  return Promise.all([
    admin.surveyImportBatch.count({ where }), admin.surveyIndicatorResult.count({ where }), admin.surveyDomainResult.count({ where }),
    admin.surveyDomainComparison.count({ where }), admin.surveyParticipationResult.count({ where }),
  ]);
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
  if (created.memberships.length) await admin.institutionUserRole.deleteMany({ where: { institutionUserId: { in: created.memberships } } }).catch(() => undefined);
  if (created.roles.length) await admin.rolePermission.deleteMany({ where: { roleId: { in: created.roles } } }).catch(() => undefined);
  if (created.memberships.length) await admin.institutionUser.deleteMany({ where: { id: { in: created.memberships } } }).catch(() => undefined);
  if (created.roles.length) await admin.role.deleteMany({ where: { id: { in: created.roles } } }).catch(() => undefined);
  if (created.staff.length) await admin.staffMember.deleteMany({ where: { id: { in: created.staff } } }).catch(() => undefined);
  if (created.users.length) await admin.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => undefined);
  if (created.years.length) await admin.academicYear.deleteMany({ where: { id: { in: created.years } } }).catch(() => undefined);
  if (created.institutions.length) await admin.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => undefined);
}

test('survey Excel HTTP import is authorized, tenant-safe, atomic, and insert-only', async (t) => {
  assert.notEqual(process.env['NODE_ENV'], 'production');
  let fixture: Fixture | undefined;
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    fixture = await createFixture();
    const f = fixture;
    const route = (surveyId = f.surveyAId, roundId = f.successRoundId, action = 'import') => `http://127.0.0.1:${port}/api/surveys/${surveyId}/rounds/${roundId}/results/${action}`;
    const headers = (token?: string) => ({ ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-institution-id': f.institutionAId, 'x-academic-year-id': f.yearAId });
    const post = (buffer: Buffer, options: { token?: string; surveyId?: string; roundId?: string; fileName?: string; action?: string } = {}) => fetch(route(options.surveyId, options.roundId, options.action), { method: 'POST', headers: headers(options.token), body: formWithFile(buffer, options.fileName) });
    const validFile = await workbookBuffer();
    const differentFile = await workbookBuffer({ marker: 'different-file' });
    assert.notEqual(sha256SurveyExcelFile(validFile), sha256SurveyExcelFile(differentFile));
    const allSurveyIds = [f.surveyAId, f.archivedSurveyAId, f.surveyBId];

    await t.test('authentication and surveys:update permission are required', async () => {
      assert.equal((await post(validFile)).status, 401);
      assert.equal((await post(validFile, { token: f.readActor.token })).status, 403);
    });

    await t.test('syntactic, semantic, and empty imports return stable 400 errors and write nothing', async () => {
      const before = await counts(allSurveyIds);
      const syntactic = await post(await workbookBuffer({ percentage: 101 }), { token: f.updateActor.token, roundId: f.spareRoundId });
      assert.equal(syntactic.status, 400);
      const syntacticBody = await syntactic.json();
      assert.equal(syntacticBody.error.code, 'SURVEY_IMPORT_PREVIEW_INVALID');
      assert.ok(syntacticBody.error.details.errors.some((error: any) => error.code === 'INVALID_PERCENTAGE'));
      const semantic = await post(await workbookBuffer({ indicatorCode: 'UNKNOWN_INDICATOR', segmentCode: 'UNKNOWN_SEGMENT' }), { token: f.updateActor.token, roundId: f.spareRoundId });
      assert.equal(semantic.status, 400);
      const semanticBody = await semantic.json();
      assert.equal(semanticBody.error.code, 'SURVEY_IMPORT_PREVIEW_INVALID');
      assert.ok(semanticBody.error.details.errors.some((error: any) => error.code === 'UNKNOWN_INDICATOR_CODE'));
      const empty = await post(await workbookBuffer({ empty: true }), { token: f.updateActor.token, roundId: f.spareRoundId });
      assert.equal(empty.status, 400);
      assert.equal((await empty.json()).error.code, 'SURVEY_IMPORT_EMPTY');
      assert.deepEqual(await counts(allSurveyIds), before);
    });

    await t.test('oversized logical row and column dimensions return 413 before any import writes', async () => {
      const before = await counts(allSurveyIds);
      for (const [farCell, expectedCode] of [
        [`A${MAX_SURVEY_IMPORT_ROWS + 1}`, 'TOO_MANY_ROWS'],
        ['I2', 'TOO_MANY_COLUMNS'],
      ]) {
        const response = await post(await workbookBuffer({ farCell }), { token: f.updateActor.token, roundId: f.spareRoundId });
        assert.equal(response.status, 413);
        const body = await response.json();
        assert.equal(body.error.code, 'SURVEY_IMPORT_TOO_LARGE');
        assert.ok(body.error.details.errors.some((error: any) => error.code === expectedCode));
        assert.deepEqual(await counts(allSurveyIds), before);
      }
    });

    await t.test('archive expansion, single-member, entry-count, and malformed rejections write nothing', async () => {
      const before = await counts(allSurveyIds);
      for (const kind of ['TOTAL', 'SINGLE', 'ENTRIES'] as const) {
        const buffer = await archiveBomb(kind);
        assert.ok(buffer.length < 10 * 1024 * 1024);
        const response = await post(buffer, { token: f.updateActor.token, roundId: f.spareRoundId });
        assert.equal(response.status, 413);
        assert.equal((await response.json()).error.code, 'SURVEY_IMPORT_TOO_LARGE');
        assert.deepEqual(await counts(allSurveyIds), before);
      }
      const malformed = await post(Buffer.from('not a ZIP archive'), { token: f.updateActor.token, roundId: f.spareRoundId });
      assert.equal(malformed.status, 400);
      const body = await malformed.json();
      assert.equal(body.error.code, 'SURVEY_IMPORT_PREVIEW_INVALID');
      assert.ok(body.error.details.errors.some((error: any) => error.code === 'MALFORMED_WORKBOOK'));
      assert.deepEqual(await counts(allSurveyIds), before);
    });

    await t.test('foreign survey, mismatched round, and archived survey retain context errors and zero writes', async () => {
      const before = await counts(allSurveyIds);
      const foreign = await post(validFile, { token: f.updateActor.token, surveyId: f.surveyBId, roundId: f.roundBId });
      assert.equal(foreign.status, 404);
      assert.equal((await foreign.json()).error.code, 'SURVEY_NOT_FOUND');
      const mismatched = await post(validFile, { token: f.updateActor.token, roundId: f.roundBId });
      assert.equal(mismatched.status, 404);
      assert.equal((await mismatched.json()).error.code, 'SURVEY_ROUND_NOT_FOUND');
      const archived = await post(validFile, { token: f.updateActor.token, surveyId: f.archivedSurveyAId, roundId: f.archivedRoundId });
      assert.equal(archived.status, 409);
      assert.equal((await archived.json()).error.code, 'SURVEY_ARCHIVED');
      assert.deepEqual(await counts(allSurveyIds), before);
    });

    let successBatchId = '';
    await t.test('surveys:update imports valid XLSX and returns a compact 201 response', async () => {
      const response = await post(validFile, { token: f.updateActor.token });
      assert.equal(response.status, 201);
      const body = await response.json();
      successBatchId = body.importBatchId;
      assert.deepEqual(Object.keys(body).sort(), ['fileHash', 'importBatchId', 'importedAt', 'invalidRowCount', 'roundId', 'rowCount', 'status', 'surveyId', 'validRowCount'].sort());
      assert.deepEqual({ surveyId: body.surveyId, roundId: body.roundId, status: body.status, rowCount: body.rowCount, validRowCount: body.validRowCount, invalidRowCount: body.invalidRowCount }, { surveyId: f.surveyAId, roundId: f.successRoundId, status: 'COMPLETED', rowCount: 4, validRowCount: 4, invalidRowCount: 0 });
      assert.equal(body.fileHash, sha256SurveyExcelFile(validFile));
      assert.ok(new Date(body.importedAt).getTime() > 0);
    });

    await t.test('successful HTTP import persists exact batch, results, foreign keys, zero/null values, and one audit event', async () => {
      const batch = await admin.surveyImportBatch.findUniqueOrThrow({ where: { id: successBatchId } });
      assert.equal(batch.status, 'COMPLETED');
      assert.equal(batch.originalFileName, 'school-results.xlsx');
      assert.equal(batch.fileHash, sha256SurveyExcelFile(validFile));
      assert.equal(batch.importedByUserId, f.updateActor.userId);
      assert.deepEqual([batch.rowCount, batch.validRowCount, batch.invalidRowCount], [4, 4, 0]);
      assert.ok(batch.importedAt);
      const [indicator, domain, comparison, participation] = await Promise.all([
        admin.surveyIndicatorResult.findFirstOrThrow({ where: { roundId: f.successRoundId } }), admin.surveyDomainResult.findFirstOrThrow({ where: { roundId: f.successRoundId } }),
        admin.surveyDomainComparison.findFirstOrThrow({ where: { roundId: f.successRoundId } }), admin.surveyParticipationResult.findFirstOrThrow({ where: { roundId: f.successRoundId } }),
      ]);
      for (const row of [indicator, domain, comparison, participation]) {
        assert.equal(row.institutionId, f.institutionAId); assert.equal(row.academicYearId, f.yearAId); assert.equal(row.surveyId, f.surveyAId); assert.equal(row.roundId, f.successRoundId); assert.equal(row.segmentId, f.segmentAId);
      }
      assert.equal(indicator.sectionId, f.sectionAId); assert.equal(indicator.domainId, f.domainAId); assert.equal(indicator.indicatorId, f.indicatorAId); assert.equal(indicator.importBatchId, batch.id);
      assert.equal(indicator.reportedPercentage?.toNumber(), 0); assert.equal(indicator.respondentCount, 0); assert.equal(indicator.earnedTotal, null); assert.equal(indicator.possibleTotal, null);
      assert.equal(domain.domainId, f.domainAId); assert.equal(domain.importBatchId, batch.id); assert.equal(domain.scorePercentage, null); assert.equal(domain.respondentCount, 0); assert.equal(domain.isComparable, false);
      assert.equal(comparison.domainId, f.domainAId); assert.equal(comparison.comparisonRoundId, f.comparisonRoundId); assert.equal(comparison.comparisonValue?.toNumber(), 0); assert.equal(comparison.comparisonCode, null);
      assert.equal(participation.importBatchId, batch.id); assert.equal(participation.participantCount, 0); assert.equal(participation.eligibleCount, null); assert.equal(participation.responseRate?.toNumber(), 0);
      assert.equal(await admin.auditLog.count({ where: { institutionId: f.institutionAId, actorUserId: f.updateActor.userId, action: 'SURVEY_RESULTS_IMPORTED', entityType: 'SurveyImportBatch', entityId: batch.id } }), 1);
    });

    await t.test('same file uses duplicate precedence and different file reports existing results without writes or audit', async () => {
      const before = await counts(allSurveyIds);
      const auditsBefore = await admin.auditLog.count({ where: { institutionId: f.institutionAId, action: 'SURVEY_RESULTS_IMPORTED' } });
      const duplicate = await post(validFile, { token: f.updateActor.token });
      assert.equal(duplicate.status, 409);
      assert.equal((await duplicate.json()).error.code, 'SURVEY_IMPORT_DUPLICATE_FILE');
      const existing = await post(differentFile, { token: f.updateActor.token });
      assert.equal(existing.status, 409);
      assert.equal((await existing.json()).error.code, 'SURVEY_ROUND_RESULTS_ALREADY_EXIST');
      assert.deepEqual(await counts(allSurveyIds), before);
      assert.equal(await admin.auditLog.count({ where: { institutionId: f.institutionAId, action: 'SURVEY_RESULTS_IMPORTED' } }), auditsBefore);
    });

    await t.test('pre-existing result blocks batch creation', async () => {
      const seeded = await admin.surveyIndicatorResult.create({ data: { institutionId: f.institutionAId, academicYearId: f.yearAId, surveyId: f.surveyAId, roundId: f.existingRoundId, sectionId: f.sectionAId, domainId: f.domainAId, indicatorId: f.indicatorAId, segmentId: f.segmentAId, reportedPercentage: 44 } });
      try {
        const response = await post(differentFile, { token: f.updateActor.token, roundId: f.existingRoundId });
        assert.equal(response.status, 409);
        assert.equal((await response.json()).error.code, 'SURVEY_ROUND_RESULTS_ALREADY_EXIST');
        assert.equal(await admin.surveyImportBatch.count({ where: { roundId: f.existingRoundId } }), 0);
        assert.deepEqual(await counts([f.surveyAId]), [1, 2, 1, 1, 1]);
      } finally {
        await admin.surveyIndicatorResult.delete({ where: { id: seeded.id } });
      }
    });

    await t.test('the same file hash imports successfully into another valid round', async () => {
      const response = await post(validFile, { token: f.updateActor.token, roundId: f.otherRoundId });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.status, 'COMPLETED');
      assert.equal(body.fileHash, sha256SurveyExcelFile(validFile));
      assert.equal(await admin.surveyImportBatch.count({ where: { roundId: f.otherRoundId } }), 1);
    });

    await t.test('preview endpoint remains HTTP 200 and read-only after import route is added', async () => {
      const before = await counts(allSurveyIds);
      const response = await post(validFile, { token: f.updateActor.token, roundId: f.spareRoundId, action: 'preview' });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).valid, true);
      assert.deepEqual(await counts(allSurveyIds), before);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await admin.$disconnect();
    await Promise.all([prisma.$disconnect(), platformPrisma.$disconnect()]);
  }
});
