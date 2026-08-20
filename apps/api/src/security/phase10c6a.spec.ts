import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { MAX_SPREADSHEET_COLUMNS, MAX_SPREADSHEET_ROWS, SpreadsheetValidationError, XLSX_MIME, parseExamResultsWorkbook } from './spreadsheet-security';

async function workbookBuffer(config: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  config(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('Phase 10C-6A: valid exam results workbook is parsed by the server boundary', async () => {
  const buffer = await workbookBuffer(workbook => {
    const sheet = workbook.addWorksheet('Results');
    sheet.addRow(['nationalId', 'isAbsence', 'question_1_00000000-0000-4000-8000-000000000001']);
    sheet.addRow(['12345', 'false', 8]);
  });
  const rows = await parseExamResultsWorkbook(buffer, XLSX_MIME);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nationalId, '12345');
});

test('Phase 10C-6A: formulas and multiple worksheets are rejected', async () => {
  const formula = await workbookBuffer(workbook => {
    const sheet = workbook.addWorksheet('Results');
    sheet.addRow(['nationalId', 'isAbsence', 'question_1_00000000-0000-4000-8000-000000000001']);
    sheet.addRow(['12345', 'false', { formula: '1+1' }]);
  });
  await assert.rejects(() => parseExamResultsWorkbook(formula, XLSX_MIME), (error: unknown) => error instanceof SpreadsheetValidationError && error.errors[0].code === 'FORMULA_NOT_ALLOWED');
  const multiple = await workbookBuffer(workbook => { workbook.addWorksheet('Results'); workbook.addWorksheet('Extra'); });
  await assert.rejects(() => parseExamResultsWorkbook(multiple, XLSX_MIME), (error: unknown) => error instanceof SpreadsheetValidationError && error.errors[0].code === 'MULTIPLE_SHEETS');
});

test('Phase 10C-6A: row and column ceilings are enforced', async () => {
  const tooManyRows = await workbookBuffer(workbook => {
    const sheet = workbook.addWorksheet('Results');
    sheet.addRow(['nationalId', 'isAbsence', 'question_1_00000000-0000-4000-8000-000000000001']);
    for (let index = 0; index < MAX_SPREADSHEET_ROWS + 1; index += 1) sheet.addRow([String(index), 'false', 1]);
  });
  await assert.rejects(() => parseExamResultsWorkbook(tooManyRows, XLSX_MIME), (error: unknown) => error instanceof SpreadsheetValidationError && error.errors[0].code === 'TOO_MANY_ROWS');
  const tooManyColumns = await workbookBuffer(workbook => {
    const sheet = workbook.addWorksheet('Results');
    sheet.addRow(Array.from({ length: MAX_SPREADSHEET_COLUMNS + 1 }, (_, index) => `column_${index}`));
  });
  await assert.rejects(() => parseExamResultsWorkbook(tooManyColumns, XLSX_MIME), (error: unknown) => error instanceof SpreadsheetValidationError && error.errors[0].code === 'TOO_MANY_COLUMNS');
});
