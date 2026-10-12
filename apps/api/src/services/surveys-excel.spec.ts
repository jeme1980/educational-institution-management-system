import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { assertSurveyExcelDimensions, MAX_SURVEY_IMPORT_COLUMNS, MAX_SURVEY_IMPORT_ROWS, MAX_SURVEY_IMPORT_WORKSHEETS, parseSurveyExcelWorkbook, SurveyExcelWorkbookError } from './surveys-excel.parser';
import { validateSurveyExcelWorkbook } from './surveys-excel.validation';
import type { SurveyExcelSheetName } from './surveys-excel.types';

type SheetFixture = { headers: string[]; rows: unknown[][] };
type WorkbookFixture = Record<SurveyExcelSheetName, SheetFixture>;

const fixture = (): WorkbookFixture => ({
  IndicatorResults: {
    headers: ['indicatorCode', 'segmentCode', 'reportedPercentage', 'respondentCount', 'earnedTotal', 'possibleTotal'],
    rows: [[' indicator one ', ' all respondents ', 0, 0, null, null]],
  },
  DomainResults: {
    headers: ['domainCode', 'segmentCode', 'scorePercentage', 'respondentCount', 'isComparable'],
    rows: [[' domain one ', ' all respondents ', 100, 0, true]],
  },
  Comparisons: {
    headers: ['domainCode', 'segmentCode', 'comparisonType', 'comparisonCode', 'comparisonValue', 'comparisonRoundCode', 'noteAr', 'noteHe'],
    rows: [[' domain one ', ' all respondents ', ' previous round ', null, 75, ' round one ', null, null]],
  },
  Participation: {
    headers: ['segmentCode', 'participantCount', 'eligibleCount', 'responseRate'],
    rows: [[' all respondents ', 0, 0, 0]],
  },
});

async function workbookBuffer(configure?: (config: WorkbookFixture, workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const config = fixture();
  const workbook = new ExcelJS.Workbook();
  configure?.(config, workbook);
  for (const [sheetName, sheetFixture] of Object.entries(config)) {
    if (workbook.getWorksheet(sheetName)) continue;
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(sheetFixture.headers);
    for (const row of sheetFixture.rows) sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('valid aggregate workbook preserves zero, null, source coordinates, and canonical codes', async () => {
  const parsed = await parseSurveyExcelWorkbook(await workbookBuffer());
  const result = validateSurveyExcelWorkbook(parsed);
  assert.deepEqual(result.errors, []);
  assert.equal(result.workbook.indicatorResults[0].reportedPercentage, 0);
  assert.equal(result.workbook.indicatorResults[0].respondentCount, 0);
  assert.equal(result.workbook.indicatorResults[0].earnedTotal, null);
  assert.equal(result.workbook.indicatorResults[0].possibleTotal, null);
  assert.equal(result.workbook.indicatorResults[0].indicatorCode, 'INDICATOR_ONE');
  assert.equal(result.workbook.indicatorResults[0].segmentCode, 'ALL_RESPONDENTS');
  assert.equal(result.workbook.indicatorResults[0].sourceSheet, 'IndicatorResults');
  assert.equal(result.workbook.indicatorResults[0].sourceRow, 2);
  assert.equal(result.workbook.comparisons[0].comparisonType, 'PREVIOUS_ROUND');
  assert.equal(result.workbook.comparisons[0].comparisonCode, null);
  assert.equal(result.workbook.comparisons[0].noteAr, null);
  const serialized = JSON.stringify(result.workbook).toLowerCase();
  for (const identity of ['studentid', 'studentname', 'staffid', 'guardianid', 'nationalid', 'email', 'phone']) assert.equal(serialized.includes(identity), false);
});

test('missing required sheet is reported with a stable error shape', async () => {
  const buffer = await workbookBuffer((config) => {
    delete (config as Partial<WorkbookFixture>).Comparisons;
  });
  await assert.rejects(
    () => parseSurveyExcelWorkbook(buffer),
    (error: unknown) => error instanceof SurveyExcelWorkbookError
      && error.errors.some((item) => item.sheet === 'Comparisons' && item.row === 0 && item.column === '' && item.code === 'MISSING_SHEET'),
  );
});

test('missing required column is rejected', async () => {
  const buffer = await workbookBuffer((config) => {
    config.DomainResults.headers = ['domainCode', 'scorePercentage', 'respondentCount', 'isComparable'];
    config.DomainResults.rows = [['DOMAIN', 50, 2, true]];
  });
  const result = validateSurveyExcelWorkbook(await parseSurveyExcelWorkbook(buffer));
  assert.ok(result.errors.some((item) => item.sheet === 'DomainResults' && item.column === 'segmentCode' && item.code === 'MISSING_REQUIRED_COLUMN'));
});

test('percentage boundaries 0 and 100 and respondentCount zero are accepted', async () => {
  const buffer = await workbookBuffer((config) => {
    config.IndicatorResults.rows = [
      ['INDICATOR_0', 'SEGMENT', 0, 0, null, null],
      ['INDICATOR_100', 'SEGMENT', 100, 0, null, null],
    ];
  });
  const result = validateSurveyExcelWorkbook(await parseSurveyExcelWorkbook(buffer));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.workbook.indicatorResults.map((row) => row.reportedPercentage), [0, 100]);
  assert.deepEqual(result.workbook.indicatorResults.map((row) => row.respondentCount), [0, 0]);
});

test('percentages below 0 and above 100 are rejected', async () => {
  const buffer = await workbookBuffer((config) => {
    config.IndicatorResults.rows = [
      ['INDICATOR_LOW', 'SEGMENT', -1, 1, null, null],
      ['INDICATOR_HIGH', 'SEGMENT', 101, 1, null, null],
    ];
  });
  const errors = validateSurveyExcelWorkbook(await parseSurveyExcelWorkbook(buffer)).errors;
  assert.equal(errors.filter((item) => item.code === 'INVALID_PERCENTAGE').length, 2);
});

test('invalid aggregate numbers and earned totals above possible totals are rejected', async () => {
  const buffer = await workbookBuffer((config) => {
    config.IndicatorResults.rows = [
      ['INDICATOR_A', 'SEGMENT', 50, -1, 11, 10],
      ['INDICATOR_B', 'SEGMENT', 50, 1, 'not-a-number', 10],
    ];
  });
  const errors = validateSurveyExcelWorkbook(await parseSurveyExcelWorkbook(buffer)).errors;
  assert.ok(errors.some((item) => item.code === 'INVALID_INTEGER' && item.column === 'respondentCount'));
  assert.ok(errors.some((item) => item.code === 'INVALID_NUMBER' && item.column === 'earnedTotal'));
  assert.ok(errors.some((item) => item.code === 'EARNED_EXCEEDS_POSSIBLE'));
});

test('canonical logical duplicates are rejected in every sheet', async () => {
  const buffer = await workbookBuffer((config) => {
    config.IndicatorResults.rows.push(['INDICATOR   ONE', 'ALL   RESPONDENTS', 50, 2, null, null]);
    config.DomainResults.rows.push(['DOMAIN   ONE', 'ALL   RESPONDENTS', 50, 2, true]);
    config.Comparisons.rows.push(['DOMAIN   ONE', 'ALL   RESPONDENTS', 'PREVIOUS   ROUND', null, 70, null, null, null]);
    config.Participation.rows.push(['ALL   RESPONDENTS', 1, 1, 100]);
  });
  const errors = validateSurveyExcelWorkbook(await parseSurveyExcelWorkbook(buffer)).errors;
  assert.equal(errors.filter((item) => item.code === 'DUPLICATE_ROW').length, 4);
});

test('unknown and PII-like columns are rejected by the allowlist', async () => {
  const buffer = await workbookBuffer((config) => {
    config.IndicatorResults.headers.push('studentId', 'unexpectedMetric');
    config.IndicatorResults.rows[0].push('student-1', 9);
  });
  const errors = validateSurveyExcelWorkbook(await parseSurveyExcelWorkbook(buffer)).errors;
  assert.ok(errors.some((item) => item.column === 'studentId' && item.code === 'PII_COLUMN_NOT_ALLOWED'));
  assert.ok(errors.some((item) => item.column === 'unexpectedMetric' && item.code === 'UNKNOWN_COLUMN'));
  assert.equal(JSON.stringify(validateSurveyExcelWorkbook(await parseSurveyExcelWorkbook(buffer)).workbook).includes('student-1'), false);
});

test('worksheets outside the four-sheet contract are rejected by the sheet limit', async () => {
  const buffer = await workbookBuffer((_config, workbook) => {
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['studentId']);
    sheet.addRow(['student-1']);
  });
  await assert.rejects(() => parseSurveyExcelWorkbook(buffer), (error: unknown) =>
    error instanceof SurveyExcelWorkbookError && error.errors[0].code === 'TOO_MANY_SHEETS');
});

test('completely blank rows are ignored while the original source row is preserved', async () => {
  const buffer = await workbookBuffer((config) => {
    config.IndicatorResults.rows = [[], ['INDICATOR', 'SEGMENT', 50, 1, null, null]];
  });
  const parsed = await parseSurveyExcelWorkbook(buffer);
  assert.equal(parsed.indicatorResults.length, 1);
  assert.equal(parsed.indicatorResults[0].sourceRow, 3);
});

test('formula cells are rejected before syntactic validation', async () => {
  const buffer = await workbookBuffer((config) => {
    config.IndicatorResults.rows = [['INDICATOR', 'SEGMENT', { formula: '50+50', result: 100 }, 1, null, null]];
  });
  await assert.rejects(
    () => parseSurveyExcelWorkbook(buffer),
    (error: unknown) => error instanceof SurveyExcelWorkbookError && error.errors[0].code === 'FORMULA_NOT_ALLOWED' && error.errors[0].row === 2,
  );
});

test('sparse far row rejects before column or cell traversal', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('IndicatorResults');
  sheet.getCell(`A${MAX_SURVEY_IMPORT_ROWS + 1}`).value = 'FAR_ROW';
  sheet.eachRow = () => { throw new Error('row traversal started'); };
  sheet.getRow = () => { throw new Error('cell traversal started'); };
  assert.throws(() => assertSurveyExcelDimensions(workbook), (error: unknown) =>
    error instanceof SurveyExcelWorkbookError && error.errors[0].code === 'TOO_MANY_ROWS');
});

test('sparse far column rejects before cell traversal', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Comparisons');
  sheet.getCell(2, MAX_SURVEY_IMPORT_COLUMNS + 1).value = 'FAR_COLUMN';
  sheet.getRow = () => { throw new Error('cell traversal started'); };
  assert.throws(() => assertSurveyExcelDimensions(workbook), (error: unknown) =>
    error instanceof SurveyExcelWorkbookError && error.errors[0].code === 'TOO_MANY_COLUMNS');
});

test('exact and just-below row and column bounds remain valid', async () => {
  for (const rowCount of [MAX_SURVEY_IMPORT_ROWS - 1, MAX_SURVEY_IMPORT_ROWS]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Comparisons');
    sheet.getCell(rowCount, MAX_SURVEY_IMPORT_COLUMNS).value = 'AT_BOUND';
    assert.doesNotThrow(() => assertSurveyExcelDimensions(workbook));
  }
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Comparisons').getCell(2, MAX_SURVEY_IMPORT_COLUMNS - 1).value = 'BELOW_BOUND';
  assert.doesNotThrow(() => assertSurveyExcelDimensions(workbook));
});

test('the four-sheet contract rejects a fifth sheet before row traversal', async () => {
  const workbook = new ExcelJS.Workbook();
  for (let index = 0; index < MAX_SURVEY_IMPORT_WORKSHEETS + 1; index += 1) {
    const sheet = workbook.addWorksheet(`Sheet${index}`);
    sheet.eachRow = () => { throw new Error('row traversal started'); };
  }
  assert.throws(() => assertSurveyExcelDimensions(workbook), (error: unknown) =>
    error instanceof SurveyExcelWorkbookError && error.errors[0].code === 'TOO_MANY_SHEETS');
});

test('binary workbooks with sparse over-limit row or column reject before parsing rows', async () => {
  for (const [cell, code] of [[`A${MAX_SURVEY_IMPORT_ROWS + 1}`, 'TOO_MANY_ROWS'], ['I2', 'TOO_MANY_COLUMNS']]) {
    const buffer = await workbookBuffer((_config, workbook) => {
      workbook.addWorksheet('IndicatorResults').getCell(cell).value = 'OUT_OF_BOUND';
    });
    await assert.rejects(() => parseSurveyExcelWorkbook(buffer), (error: unknown) =>
      error instanceof SurveyExcelWorkbookError && error.errors[0].code === code);
  }
});
