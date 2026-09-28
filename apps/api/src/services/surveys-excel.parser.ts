import ExcelJS from 'exceljs';
import {
  SURVEY_EXCEL_COLUMNS,
  SURVEY_EXCEL_SHEET_NAMES,
  type SurveyExcelCellValue,
  type SurveyExcelComparisonRow,
  type SurveyExcelDomainResultRow,
  type SurveyExcelIndicatorResultRow,
  type SurveyExcelParsedWorkbook,
  type SurveyExcelParticipationRow,
  type SurveyExcelSheetName,
  type SurveyExcelValidationError,
} from './surveys-excel.types';

export class SurveyExcelWorkbookError extends Error {
  constructor(public readonly errors: SurveyExcelValidationError[]) {
    super('Survey Excel workbook parsing failed');
    this.name = 'SurveyExcelWorkbookError';
  }
}

const formulaError = (sheet: SurveyExcelSheetName, row: number, column: string): SurveyExcelValidationError => ({
  sheet,
  row,
  column,
  code: 'FORMULA_NOT_ALLOWED',
  message: 'Formula cells are not allowed in survey result imports.',
});

const isFormula = (value: unknown): boolean => Boolean(value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value));

export function normalizeSurveyExcelCell(value: unknown): SurveyExcelCellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'richText' in value) {
    const text = ((value as { richText?: Array<{ text?: string }> }).richText || []).map((part) => part.text || '').join('').trim();
    return text || null;
  }
  const text = String(value).replace(/^\uFEFF/, '').trim();
  return text || null;
}

const emptyHeaders = (): Record<SurveyExcelSheetName, string[]> => ({
  IndicatorResults: [],
  DomainResults: [],
  Comparisons: [],
  Participation: [],
});

const rowValues = (sheet: ExcelJS.Worksheet, sheetName: SurveyExcelSheetName, headers: string[], rowNumber: number): Record<string, SurveyExcelCellValue> => {
  const values: Record<string, SurveyExcelCellValue> = {};
  for (let index = 0; index < headers.length; index += 1) {
    const raw = sheet.getRow(rowNumber).getCell(index + 1).value;
    if (isFormula(raw)) throw new SurveyExcelWorkbookError([formulaError(sheetName, rowNumber, headers[index] || `column_${index + 1}`)]);
    if (headers[index]) values[headers[index]] = normalizeSurveyExcelCell(raw);
  }
  return values;
};

const parsedRow = <T extends object>(sheetName: SurveyExcelSheetName, sourceRow: number, values: Record<string, SurveyExcelCellValue>): T => {
  const result: Record<string, SurveyExcelCellValue | SurveyExcelSheetName | number> = { sourceSheet: sheetName, sourceRow };
  for (const column of SURVEY_EXCEL_COLUMNS[sheetName]) result[column] = values[column] ?? null;
  return result as T;
};

export async function parseSurveyExcelWorkbook(buffer: Uint8Array): Promise<SurveyExcelParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new SurveyExcelWorkbookError([{ sheet: '', row: 0, column: '', code: 'MALFORMED_WORKBOOK', message: 'The file is not a valid XLSX workbook.' }]);
  }

  const missingSheets = SURVEY_EXCEL_SHEET_NAMES.filter((sheetName) => !workbook.getWorksheet(sheetName));
  if (missingSheets.length) {
    throw new SurveyExcelWorkbookError(missingSheets.map((sheetName) => ({
      sheet: sheetName,
      row: 0,
      column: '',
      code: 'MISSING_SHEET',
      message: `Required sheet ${sheetName} is missing.`,
    })));
  }

  const parsed: SurveyExcelParsedWorkbook = {
    sheetNames: workbook.worksheets.map((sheet) => sheet.name),
    headers: emptyHeaders(),
    indicatorResults: [],
    domainResults: [],
    comparisons: [],
    participation: [],
  };

  for (const sheetName of SURVEY_EXCEL_SHEET_NAMES) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const headers = Array.from({ length: sheet.columnCount }, (_, index) => {
      const value = sheet.getRow(1).getCell(index + 1).value;
      if (isFormula(value)) throw new SurveyExcelWorkbookError([formulaError(sheetName, 1, `column_${index + 1}`)]);
      return String(normalizeSurveyExcelCell(value) ?? '').trim();
    });
    parsed.headers[sheetName] = headers;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const rawCells = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getRow(rowNumber).getCell(index + 1).value);
      for (let index = 0; index < rawCells.length; index += 1) {
        if (isFormula(rawCells[index])) throw new SurveyExcelWorkbookError([formulaError(sheetName, rowNumber, headers[index] || `column_${index + 1}`)]);
      }
      if (rawCells.every((value) => normalizeSurveyExcelCell(value) === null)) continue;
      const values = rowValues(sheet, sheetName, headers, rowNumber);
      if (sheetName === 'IndicatorResults') parsed.indicatorResults.push(parsedRow<SurveyExcelIndicatorResultRow>(sheetName, rowNumber, values));
      if (sheetName === 'DomainResults') parsed.domainResults.push(parsedRow<SurveyExcelDomainResultRow>(sheetName, rowNumber, values));
      if (sheetName === 'Comparisons') parsed.comparisons.push(parsedRow<SurveyExcelComparisonRow>(sheetName, rowNumber, values));
      if (sheetName === 'Participation') parsed.participation.push(parsedRow<SurveyExcelParticipationRow>(sheetName, rowNumber, values));
    }
  }
  return parsed;
}
