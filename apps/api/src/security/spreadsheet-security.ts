import ExcelJS from 'exceljs';

export const MAX_SPREADSHEET_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5_000;
export const MAX_SPREADSHEET_COLUMNS = 64;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class SpreadsheetValidationError extends Error {
  constructor(public readonly errors: Array<{ row: number; column: string; code: string }>) {
    super('Spreadsheet validation failed');
    this.name = 'SpreadsheetValidationError';
  }
}

const fail = (code: string, row = 0, column = ''): never => {
  throw new SpreadsheetValidationError([{ row, column, code }]);
};

export const normalizeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null && 'richText' in value) {
    return ((value as { richText?: Array<{ text?: string }> }).richText || []).map(item => item.text || '').join('').trim();
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return normalizeCell((value as { result?: unknown }).result);
  }
  return String(value).replace(/^\uFEFF/, '').trim();
};

const normalizeHeader = (value: unknown): string => normalizeCell(value).replace(/[\s_-]+/g, '').toLowerCase();

const hasFormula = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const cell = value as { formula?: unknown; sharedFormula?: unknown };
  return typeof cell.formula === 'string' || typeof cell.sharedFormula === 'string';
};

export async function parseExamResultsWorkbook(buffer: Uint8Array, contentType: string): Promise<Array<Record<string, string>>> {
  if (!contentType.toLowerCase().split(';')[0].trim().includes(XLSX_MIME)) fail('INVALID_MIME');
  if (buffer.length > MAX_SPREADSHEET_FILE_BYTES) fail('FILE_TOO_LARGE');
  if (buffer.length < 4 || Buffer.from(buffer).toString('binary', 0, 2) !== 'PK') fail('MALFORMED_XLSX');
  if (Buffer.from(buffer).toString('binary').includes('vbaProject.bin')) fail('MACROS_NOT_ALLOWED');

  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as any); } catch { fail('MALFORMED_XLSX'); }
  if (workbook.worksheets.length !== 1) fail('MULTIPLE_SHEETS');
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) fail('EMPTY_SHEET');
  if (sheet.columnCount > MAX_SPREADSHEET_COLUMNS) fail('TOO_MANY_COLUMNS');
  if (sheet.rowCount - 1 > MAX_SPREADSHEET_ROWS) fail('TOO_MANY_ROWS');

  for (const row of Array.from({ length: sheet.rowCount }, (_, index) => sheet.getRow(index + 1))) {
    for (let column = 1; column <= Math.min(sheet.columnCount, MAX_SPREADSHEET_COLUMNS); column += 1) {
      if (hasFormula(row.getCell(column).value)) fail('FORMULA_NOT_ALLOWED', row.number, String.fromCharCode(64 + column));
    }
  }

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, index) => { headers[index - 1] = normalizeHeader(cell.value); });
  const nationalIdIndex = headers.findIndex(value => ['nationalid', 'idnumber', 'identitynumber'].includes(value));
  const absenceIndex = headers.findIndex(value => value === 'isabsence');
  if (nationalIdIndex < 0) fail('REQUIRED_COLUMNS', 1, 'nationalId');
  if (absenceIndex < 0) fail('REQUIRED_COLUMNS', 1, 'isAbsence');

  const questionIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(item => item.header.startsWith('question'));
  if (!questionIndexes.length) fail('QUESTION_COLUMNS', 1, 'question');

  const rows: Array<Record<string, string>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const result: Record<string, string> = { nationalId: normalizeCell(row.getCell(nationalIdIndex + 1).value), isAbsence: normalizeCell(row.getCell(absenceIndex + 1).value) };
    const reasonIndex = headers.findIndex(value => value === 'absencereason');
    const notesIndex = headers.findIndex(value => value === 'notes');
    if (reasonIndex >= 0) result.absenceReason = normalizeCell(row.getCell(reasonIndex + 1).value);
    if (notesIndex >= 0) result.notes = normalizeCell(row.getCell(notesIndex + 1).value);
    for (const item of questionIndexes) result[item.header] = normalizeCell(row.getCell(item.index + 1).value);
    result.__row = String(rowNumber);
    rows.push(result);
  });
  return rows;
}

export const parseBooleanCell = (value: string): boolean | null => {
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'نعم'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'لا', ''].includes(normalized)) return false;
  return null;
};

export const parseNumberCell = (value: string): number | null => {
  if (!value.trim()) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};
