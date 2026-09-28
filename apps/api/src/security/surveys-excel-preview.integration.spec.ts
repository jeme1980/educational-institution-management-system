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
import { XLSX_MIME } from './spreadsheet-security';

type Fixture = {
  institutionAId: string;
  yearAId: string;
  surveyAId: string;
  archivedSurveyAId: string;
  surveyBId: string;
  roundA1Id: string;
  roundA2Id: string;
  roundBId: string;
  readToken: string;
  updateToken: string;
};

const created = {
  institutions: [] as string[], years: [] as string[], surveys: [] as string[], sections: [] as string[], domains: [] as string[],
  indicators: [] as string[], rounds: [] as string[], segments: [] as string[], users: [] as string[], staff: [] as string[],
  memberships: [] as string[], roles: [] as string[],
};

async function createActor(institutionId: string, marker: string, permissionId: string): Promise<string> {
  const email = `${marker}-${randomUUID()}@fixture.test`;
  const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } });
  const staff = await admin.staffMember.create({ data: { institutionId, firstNameAr: marker, familyNameAr: 'Survey' } });
  const membership = await admin.institutionUser.create({ data: { institutionId, userId: user.id, staffMemberId: staff.id } });
  const role = await admin.role.create({ data: { institutionId, nameAr: `${marker}-${randomUUID()}` } });
  await admin.institutionUserRole.create({ data: { institutionId, institutionUserId: membership.id, roleId: role.id } });
  await admin.rolePermission.create({ data: { institutionId, roleId: role.id, permissionId } });
  created.users.push(user.id); created.staff.push(staff.id); created.memberships.push(membership.id); created.roles.push(role.id);
  return createLocalAccessToken(user.id, email);
}

async function createFixture(): Promise<Fixture> {
  const [type, region, status, language, readPermission, updatePermission] = await Promise.all([
    admin.educationType.findFirstOrThrow(), admin.region.findFirstOrThrow(), admin.institutionStatus.findFirstOrThrow(), admin.language.findFirstOrThrow(),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'READ' } } }),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } }),
  ]);
  const marker = randomUUID();
  const institutionA = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `survey-preview-a-${marker}`, nameAr: 'Preview A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `survey-preview-b-${marker}`, nameAr: 'Preview B', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
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
  const indicatorA = await admin.surveyIndicator.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, domainId: domainA.id, code: 'INDICATOR_A', textAr: 'Indicator A' } });
  const indicatorB = await admin.surveyIndicator.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, domainId: domainB.id, code: 'INDICATOR_B', textAr: 'Indicator B' } });
  created.indicators.push(indicatorA.id, indicatorB.id);
  const roundA1 = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: 'ROUND_A1', nameAr: 'Round A1', sequenceNumber: 1 } });
  const roundA2 = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: 'ROUND_A2', nameAr: 'Round A2', sequenceNumber: 2 } });
  const roundB = await admin.surveyRound.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, surveyId: surveyB.id, code: 'ROUND_B', nameAr: 'Round B', sequenceNumber: 1 } });
  created.rounds.push(roundA1.id, roundA2.id, roundB.id);
  const segmentA = await admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SCHOOL', nameAr: 'School' } });
  const segmentB = await admin.surveySegment.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'SCHOOL', nameAr: 'School B' } });
  created.segments.push(segmentA.id, segmentB.id);
  const [readToken, updateToken] = await Promise.all([
    createActor(institutionA.id, 'read', readPermission.id),
    createActor(institutionA.id, 'update', updatePermission.id),
  ]);
  return { institutionAId: institutionA.id, yearAId: yearA.id, surveyAId: surveyA.id, archivedSurveyAId: archivedSurveyA.id, surveyBId: surveyB.id, roundA1Id: roundA1.id, roundA2Id: roundA2.id, roundBId: roundB.id, readToken, updateToken };
}

async function workbookBuffer(indicatorCode = 'INDICATOR_A', reportedPercentage = 81, segmentCode = 'SCHOOL'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheets: Array<[string, string[], unknown[]]> = [
    ['IndicatorResults', ['indicatorCode', 'segmentCode', 'reportedPercentage', 'respondentCount', 'earnedTotal', 'possibleTotal'], [indicatorCode, segmentCode, reportedPercentage, 10, null, null]],
    ['DomainResults', ['domainCode', 'segmentCode', 'scorePercentage', 'respondentCount', 'isComparable'], ['DOMAIN_A', segmentCode, 73, 10, true]],
    ['Comparisons', ['domainCode', 'segmentCode', 'comparisonType', 'comparisonCode', 'comparisonValue', 'comparisonRoundCode', 'noteAr', 'noteHe'], ['DOMAIN_A', segmentCode, 'PREVIOUS_ROUND', null, 69, 'ROUND_A2', null, null]],
    ['Participation', ['segmentCode', 'participantCount', 'eligibleCount', 'responseRate'], [segmentCode, 10, 12, 83.33]],
  ];
  for (const [name, headers, row] of sheets) { const sheet = workbook.addWorksheet(name); sheet.addRow(headers); sheet.addRow(row); }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const formWithFile = (buffer: Uint8Array, fileName = 'survey-results.xlsx', mime = XLSX_MIME): FormData => {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(buffer).buffer], { type: mime }), fileName);
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
  if (created.segments.length) await admin.surveySegment.deleteMany({ where: { id: { in: created.segments } } });
  if (created.rounds.length) await admin.surveyRound.deleteMany({ where: { id: { in: created.rounds } } });
  if (created.indicators.length) await admin.surveyIndicator.deleteMany({ where: { id: { in: created.indicators } } });
  if (created.domains.length) await admin.surveyDomain.deleteMany({ where: { id: { in: created.domains } } });
  if (created.sections.length) await admin.surveySection.deleteMany({ where: { id: { in: created.sections } } });
  if (created.surveys.length) await admin.survey.deleteMany({ where: { id: { in: created.surveys } } });
  if (created.memberships.length) await admin.institutionUserRole.deleteMany({ where: { institutionUserId: { in: created.memberships } } });
  if (created.roles.length) await admin.rolePermission.deleteMany({ where: { roleId: { in: created.roles } } });
  if (created.memberships.length) await admin.institutionUser.deleteMany({ where: { id: { in: created.memberships } } });
  if (created.roles.length) await admin.role.deleteMany({ where: { id: { in: created.roles } } });
  if (created.staff.length) await admin.staffMember.deleteMany({ where: { id: { in: created.staff } } });
  if (created.users.length) await admin.user.deleteMany({ where: { id: { in: created.users } } });
  if (created.years.length) await admin.academicYear.deleteMany({ where: { id: { in: created.years } } });
  if (created.institutions.length) await admin.institution.deleteMany({ where: { id: { in: created.institutions } } });
}

test('survey Excel HTTP preview is authenticated, tenant-safe, and read-only', async (t) => {
  assert.notEqual(process.env['NODE_ENV'], 'production');
  let fixture: Fixture | undefined;
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    fixture = await createFixture();
    const route = (surveyId = fixture!.surveyAId, roundId = fixture!.roundA1Id) => `http://127.0.0.1:${port}/api/surveys/${surveyId}/rounds/${roundId}/results/preview`;
    const headers = (token?: string) => ({ ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-institution-id': fixture!.institutionAId, 'x-academic-year-id': fixture!.yearAId });
    const validFile = await workbookBuffer();
    const before = await counts([fixture.surveyAId, fixture.archivedSurveyAId, fixture.surveyBId]);

    await t.test('unauthenticated request is rejected', async () => {
      assert.equal((await fetch(route(), { method: 'POST', headers: headers(), body: formWithFile(validFile) })).status, 401);
    });
    await t.test('surveys:read alone is rejected', async () => {
      assert.equal((await fetch(route(), { method: 'POST', headers: headers(fixture!.readToken), body: formWithFile(validFile) })).status, 403);
    });
    await t.test('surveys:update receives a valid compact preview', async () => {
      const response = await fetch(route(), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(validFile) });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.valid, true);
      assert.deepEqual(body.errors, []);
      assert.deepEqual(body.context, { surveyId: fixture!.surveyAId, roundId: fixture!.roundA1Id });
      assert.deepEqual(body.summary, { indicatorRowsTotal: 1, indicatorRowsValid: 1, domainRowsTotal: 1, domainRowsValid: 1, comparisonRowsTotal: 1, comparisonRowsValid: 1, participationRowsTotal: 1, participationRowsValid: 1, errorCount: 0 });
      for (const key of ['indicatorResults', 'domainResults', 'comparisons', 'participation', 'workbook']) assert.equal(key in body, false);
    });
    await t.test('syntactic validation errors return HTTP 200 and valid false', async () => {
      const response = await fetch(route(), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(await workbookBuffer('INDICATOR_A', 101)) });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.valid, false);
      assert.ok(body.errors.some((error: any) => error.code === 'INVALID_PERCENTAGE'));
    });
    await t.test('semantic row errors return HTTP 200 and accumulate', async () => {
      const response = await fetch(route(), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(await workbookBuffer('UNKNOWN_INDICATOR', 81, 'UNKNOWN_SEGMENT')) });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.valid, false);
      assert.ok(body.errors.some((error: any) => error.code === 'UNKNOWN_INDICATOR_CODE' && error.sheet === 'IndicatorResults' && error.row === 2));
      assert.equal(body.errors.filter((error: any) => error.code === 'UNKNOWN_SEGMENT_CODE').length, 4);
    });
    await t.test('foreign survey remains hidden', async () => {
      const response = await fetch(route(fixture!.surveyBId, fixture!.roundBId), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(validFile) });
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, 'SURVEY_NOT_FOUND');
    });
    await t.test('foreign or mismatched round remains hidden', async () => {
      const response = await fetch(route(fixture!.surveyAId, fixture!.roundBId), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(validFile) });
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, 'SURVEY_ROUND_NOT_FOUND');
    });
    await t.test('archived survey is rejected', async () => {
      const response = await fetch(route(fixture!.archivedSurveyAId, fixture!.roundA1Id), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(validFile) });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'SURVEY_ARCHIVED');
    });
    await t.test('missing file is rejected', async () => {
      const response = await fetch(route(), { method: 'POST', headers: headers(fixture!.updateToken), body: new FormData() });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'SURVEY_EXCEL_FILE_REQUIRED');
    });
    await t.test('unsupported file type is rejected', async () => {
      const response = await fetch(route(), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(Buffer.from('text'), 'results.txt', 'text/plain') });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'UNSUPPORTED_SPREADSHEET_TYPE');
    });
    await t.test('malformed XLSX binary is rejected', async () => {
      const response = await fetch(route(), { method: 'POST', headers: headers(fixture!.updateToken), body: formWithFile(Buffer.from('not an xlsx')) });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'MALFORMED_WORKBOOK');
    });
    await t.test('multiple files are rejected', async () => {
      const form = formWithFile(validFile);
      form.append('file', new Blob([Uint8Array.from(validFile).buffer], { type: XLSX_MIME }), 'second.xlsx');
      const response = await fetch(route(), { method: 'POST', headers: headers(fixture!.updateToken), body: form });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'MULTIPLE_FILES_NOT_ALLOWED');
    });
    await t.test('all preview requests leave result and import counts unchanged', async () => {
      assert.deepEqual(await counts([fixture!.surveyAId, fixture!.archivedSurveyAId, fixture!.surveyBId]), before);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await admin.$disconnect();
    await Promise.all([prisma.$disconnect(), platformPrisma.$disconnect()]);
  }
});
