import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { createSurveyResultsTemplate } from './surveys-excel.template';
import { parseSurveyExcelWorkbook, SurveyExcelWorkbookError } from './surveys-excel.parser';
import {
  MAX_SURVEY_XLSX_ARCHIVE_ENTRIES,
  MAX_SURVEY_XLSX_EXPANDED_BYTES,
  MAX_SURVEY_XLSX_SINGLE_ENTRY_BYTES,
  SurveyXlsxArchiveError,
  validateSurveyXlsxArchiveSafety,
} from './surveys-excel.archive';

async function totalExpansionBomb(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const formula = `${'1+'.repeat(500)}1`;
  for (let index = 0; index < 3; index += 1) {
    const sheet = workbook.addWorksheet(`Sheet${index}`);
    for (let row = 0; row < 3_000; row += 1) sheet.addRow(Array.from({ length: 8 }, () => ({ formula })));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function singleEntryBomb(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet');
  for (let index = 0; index < 5_000; index += 1) sheet.addRow([`${String(index).padStart(5, '0')}_${'A'.repeat(10_990)}`]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function entryCountBomb(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (let index = 0; index <= MAX_SURVEY_XLSX_ARCHIVE_ENTRIES; index += 1) workbook.addWorksheet(`Sheet${index}`).addRow(['value']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function rejectsBeforeExcelJS(buffer: Buffer, code: 'ARCHIVE_TOO_LARGE' | 'MALFORMED_WORKBOOK'): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(ExcelJS.Workbook.prototype, 'xlsx')!;
  let excelJsAccessed = false;
  Object.defineProperty(ExcelJS.Workbook.prototype, 'xlsx', {
    configurable: true,
    get() { excelJsAccessed = true; throw new Error('ExcelJS load boundary reached'); },
  });
  try {
    await assert.rejects(() => parseSurveyExcelWorkbook(buffer), (error: unknown) =>
      error instanceof SurveyExcelWorkbookError && error.errors[0].code === code);
    assert.equal(excelJsAccessed, false);
  } finally {
    Object.defineProperty(ExcelJS.Workbook.prototype, 'xlsx', descriptor);
  }
}

test('official Survey template passes streaming archive preflight and ExcelJS parsing', async () => {
  const buffer = await createSurveyResultsTemplate();
  const measurement = await validateSurveyXlsxArchiveSafety(buffer);
  assert.ok(measurement.entries > 0);
  assert.ok(measurement.expandedBytes > 0);
  assert.deepEqual((await parseSurveyExcelWorkbook(buffer)).sheetNames, ['IndicatorResults', 'DomainResults', 'Comparisons', 'Participation']);
});

test('actual streamed bytes allow the exact expanded limit and reject one byte less', async () => {
  const buffer = await createSurveyResultsTemplate();
  const measurement = await validateSurveyXlsxArchiveSafety(buffer);
  const exact = { expandedBytes: measurement.expandedBytes, singleEntryBytes: measurement.largestEntryBytes, entries: measurement.entries };
  assert.deepEqual(await validateSurveyXlsxArchiveSafety(buffer, exact), measurement);
  await assert.rejects(() => validateSurveyXlsxArchiveSafety(buffer, { ...exact, expandedBytes: exact.expandedBytes - 1 }),
    (error: unknown) => error instanceof SurveyXlsxArchiveError && error.kind === 'LIMIT');
});

test('small compressed archive exceeding total actual expanded bytes never reaches ExcelJS', async () => {
  const buffer = await totalExpansionBomb();
  assert.ok(buffer.length < 10 * 1024 * 1024);
  const measurement = await validateSurveyXlsxArchiveSafety(buffer, { expandedBytes: 80 * 1024 * 1024, singleEntryBytes: MAX_SURVEY_XLSX_SINGLE_ENTRY_BYTES, entries: MAX_SURVEY_XLSX_ARCHIVE_ENTRIES });
  assert.ok(measurement.expandedBytes > MAX_SURVEY_XLSX_EXPANDED_BYTES);
  assert.ok(measurement.largestEntryBytes < MAX_SURVEY_XLSX_SINGLE_ENTRY_BYTES);
  await rejectsBeforeExcelJS(buffer, 'ARCHIVE_TOO_LARGE');
});

test('single expanded member over the cap rejects before ExcelJS', async () => {
  const buffer = await singleEntryBomb();
  assert.ok(buffer.length < 10 * 1024 * 1024);
  const measurement = await validateSurveyXlsxArchiveSafety(buffer, { expandedBytes: MAX_SURVEY_XLSX_EXPANDED_BYTES, singleEntryBytes: 64 * 1024 * 1024, entries: MAX_SURVEY_XLSX_ARCHIVE_ENTRIES });
  assert.ok(measurement.largestEntryBytes > MAX_SURVEY_XLSX_SINGLE_ENTRY_BYTES);
  assert.ok(measurement.expandedBytes < MAX_SURVEY_XLSX_EXPANDED_BYTES);
  await rejectsBeforeExcelJS(buffer, 'ARCHIVE_TOO_LARGE');
});

test('archive entry count includes many small sheets and rejects before ExcelJS', async () => {
  const buffer = await entryCountBomb();
  assert.ok(buffer.length < 10 * 1024 * 1024);
  const measurement = await validateSurveyXlsxArchiveSafety(buffer, { expandedBytes: MAX_SURVEY_XLSX_EXPANDED_BYTES, singleEntryBytes: MAX_SURVEY_XLSX_SINGLE_ENTRY_BYTES, entries: 256 });
  assert.ok(measurement.entries > MAX_SURVEY_XLSX_ARCHIVE_ENTRIES);
  assert.ok(measurement.expandedBytes < MAX_SURVEY_XLSX_EXPANDED_BYTES);
  await rejectsBeforeExcelJS(buffer, 'ARCHIVE_TOO_LARGE');
});

test('mismatched declared and actual entry sizes are invalid before ExcelJS', async () => {
  const buffer = await createSurveyResultsTemplate();
  const tampered = Buffer.from(buffer);
  const centralHeader = tampered.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(centralHeader >= 0);
  const declaredSizeOffset = centralHeader + 24;
  tampered.writeUInt32LE(tampered.readUInt32LE(declaredSizeOffset) - 1, declaredSizeOffset);
  await rejectsBeforeExcelJS(tampered, 'MALFORMED_WORKBOOK');
});

test('malformed ZIP bytes are normalized without reaching ExcelJS', async () => {
  await rejectsBeforeExcelJS(Buffer.from('not a ZIP archive'), 'MALFORMED_WORKBOOK');
});
