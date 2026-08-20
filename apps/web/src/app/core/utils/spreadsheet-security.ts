export const MAX_SPREADSHEET_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5_000;
export const MAX_SPREADSHEET_COLUMNS = 64;

const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;
const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
]);

export function sanitizeSpreadsheetText(value: unknown): unknown {
  if (typeof value !== 'string' || !FORMULA_PREFIX.test(value)) return value;
  return `'${value}`;
}

export function sanitizeWorkbookTextCells(workbook: { worksheets: Array<{ eachRow: (callback: (row: { eachCell: (callback: (cell: { value: unknown }) => void) => void }) => void) => void }> }): void {
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => row.eachCell((cell) => {
      cell.value = sanitizeSpreadsheetText(cell.value);
    }));
  }
}

export function validateXlsxUpload(file: File): void {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('UNSUPPORTED_FILE_TYPE');
  if (file.size > MAX_SPREADSHEET_FILE_BYTES) throw new Error('FILE_TOO_LARGE');
  if (file.type && !XLSX_MIME_TYPES.has(file.type)) throw new Error('UNSUPPORTED_FILE_MIME');
}

export function validateWorksheetShape(workbook: { worksheets: Array<{ rowCount: number; columnCount: number }> }): void {
  if (workbook.worksheets.length !== 1) throw new Error('WORKSHEET_COUNT_LIMIT');
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount > MAX_SPREADSHEET_ROWS + 1) throw new Error('ROW_LIMIT');
  if (worksheet.columnCount > MAX_SPREADSHEET_COLUMNS) throw new Error('COLUMN_LIMIT');
}

export function assertNoFormulaCells(workbook: { worksheets: Array<{ eachRow: (callback: (row: { eachCell: (callback: (cell: { value: unknown }) => void) => void }) => void) => void }> }): void {
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => row.eachCell((cell) => {
      const value = cell.value;
      if (typeof value === 'string' && FORMULA_PREFIX.test(value)) throw new Error('FORMULA_NOT_ALLOWED');
      if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) throw new Error('FORMULA_NOT_ALLOWED');
    }));
  }
}
