import {
  SURVEY_EXCEL_COLUMNS,
  SURVEY_EXCEL_REQUIRED_COLUMNS,
  SURVEY_EXCEL_SHEET_NAMES,
  type SurveyExcelCellValue,
  type SurveyExcelParsedWorkbook,
  type SurveyExcelSheetName,
  type SurveyExcelSource,
  type SurveyExcelValidatedComparisonRow,
  type SurveyExcelValidatedDomainResultRow,
  type SurveyExcelValidatedIndicatorResultRow,
  type SurveyExcelValidatedParticipationRow,
  type SurveyExcelValidationError,
  type SurveyExcelValidationResult,
} from './surveys-excel.types';

const piiHeaders = new Set(['studentname', 'studentid', 'staffid', 'guardianid', 'parentid', 'email', 'phone', 'nationalid', 'individualresponse']);

export const canonicalizeSurveyExcelCode = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '_');

const pushError = (errors: SurveyExcelValidationError[], source: SurveyExcelSource, column: string, code: SurveyExcelValidationError['code'], message: string): void => {
  errors.push({ sheet: source.sourceSheet, row: source.sourceRow, column, code, message });
};

const codeValue = (value: SurveyExcelCellValue, source: SurveyExcelSource, column: string, errors: SurveyExcelValidationError[], optional = false): string | null => {
  if (value === null || (typeof value === 'string' && !value.trim())) {
    if (!optional) pushError(errors, source, column, 'EMPTY_CODE', `${column} must contain a stable code.`);
    return null;
  }
  if (typeof value !== 'string') {
    pushError(errors, source, column, 'EMPTY_CODE', `${column} must contain a text code.`);
    return null;
  }
  return canonicalizeSurveyExcelCode(value);
};

const numberValue = (value: SurveyExcelCellValue, source: SurveyExcelSource, column: string, errors: SurveyExcelValidationError[], kind: 'number' | 'integer' | 'percentage'): number | null => {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    pushError(errors, source, column, kind === 'integer' ? 'INVALID_INTEGER' : kind === 'percentage' ? 'INVALID_PERCENTAGE' : 'INVALID_NUMBER', `${column} must be a valid number.`);
    return null;
  }
  if (kind === 'integer' && (!Number.isInteger(parsed) || parsed < 0)) {
    pushError(errors, source, column, 'INVALID_INTEGER', `${column} must be an integer greater than or equal to zero.`);
    return null;
  }
  if (kind === 'number' && parsed < 0) {
    pushError(errors, source, column, 'INVALID_NUMBER', `${column} must be greater than or equal to zero.`);
    return null;
  }
  if (kind === 'percentage' && (parsed < 0 || parsed > 100)) {
    pushError(errors, source, column, 'INVALID_PERCENTAGE', `${column} must be between 0 and 100.`);
    return null;
  }
  return parsed;
};

const booleanValue = (value: SurveyExcelCellValue, source: SurveyExcelSource, column: string, errors: SurveyExcelValidationError[]): boolean | null => {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || (typeof value === 'string' && ['true', '1', 'yes'].includes(value.trim().toLowerCase()))) return true;
  if (value === 0 || (typeof value === 'string' && ['false', '0', 'no'].includes(value.trim().toLowerCase()))) return false;
  pushError(errors, source, column, 'INVALID_BOOLEAN', `${column} must be true or false.`);
  return null;
};

const textValue = (value: SurveyExcelCellValue): string | null => value === null ? null : String(value).trim() || null;

function validateHeaders(workbook: SurveyExcelParsedWorkbook, errors: SurveyExcelValidationError[]): void {
  for (const sheetName of workbook.sheetNames) {
    if (!SURVEY_EXCEL_SHEET_NAMES.includes(sheetName as SurveyExcelSheetName)) {
      errors.push({ sheet: sheetName, row: 0, column: '', code: 'UNKNOWN_SHEET', message: `Unknown sheet ${sheetName} is not allowed.` });
    }
  }
  for (const sheetName of SURVEY_EXCEL_SHEET_NAMES) {
    const headers = workbook.headers[sheetName];
    if (!workbook.sheetNames.includes(sheetName)) {
      errors.push({ sheet: sheetName, row: 0, column: '', code: 'MISSING_SHEET', message: `Required sheet ${sheetName} is missing.` });
      continue;
    }
    const seen = new Set<string>();
    for (const header of headers) {
      const normalized = header.trim();
      const securityName = normalized.replace(/[\s_-]+/g, '').toLowerCase();
      if (seen.has(normalized)) errors.push({ sheet: sheetName, row: 1, column: normalized, code: 'DUPLICATE_COLUMN', message: `Column ${normalized} appears more than once.` });
      seen.add(normalized);
      if (!SURVEY_EXCEL_COLUMNS[sheetName].includes(normalized as never)) {
        const pii = piiHeaders.has(securityName);
        errors.push({ sheet: sheetName, row: 1, column: normalized, code: pii ? 'PII_COLUMN_NOT_ALLOWED' : 'UNKNOWN_COLUMN', message: pii ? `Identity column ${normalized} is not allowed in aggregate survey imports.` : `Unknown column ${normalized} is not allowed.` });
      }
    }
    for (const required of SURVEY_EXCEL_REQUIRED_COLUMNS[sheetName]) {
      if (!seen.has(required)) errors.push({ sheet: sheetName, row: 1, column: required, code: 'MISSING_REQUIRED_COLUMN', message: `Required column ${required} is missing.` });
    }
  }
}

const findDuplicates = (rows: Array<SurveyExcelSource>, keys: Array<string | null>, errors: SurveyExcelValidationError[], columns: string): void => {
  const seen = new Map<string, SurveyExcelSource>();
  rows.forEach((row, index) => {
    const key = keys[index];
    if (!key) return;
    if (seen.has(key)) pushError(errors, row, columns, 'DUPLICATE_ROW', `Duplicate logical row for ${columns}.`);
    else seen.set(key, row);
  });
};

export function validateSurveyExcelWorkbook(parsed: SurveyExcelParsedWorkbook): SurveyExcelValidationResult {
  const errors: SurveyExcelValidationError[] = [];
  validateHeaders(parsed, errors);

  const indicatorResults: SurveyExcelValidatedIndicatorResultRow[] = parsed.indicatorResults.map((row) => {
    const indicatorCode = codeValue(row.indicatorCode, row, 'indicatorCode', errors) || '';
    const segmentCode = codeValue(row.segmentCode, row, 'segmentCode', errors) || '';
    const earnedTotal = numberValue(row.earnedTotal, row, 'earnedTotal', errors, 'number');
    const possibleTotal = numberValue(row.possibleTotal, row, 'possibleTotal', errors, 'number');
    if (earnedTotal !== null && possibleTotal !== null && earnedTotal > possibleTotal) pushError(errors, row, 'earnedTotal', 'EARNED_EXCEEDS_POSSIBLE', 'earnedTotal must not exceed possibleTotal.');
    return {
      sourceSheet: row.sourceSheet,
      sourceRow: row.sourceRow,
      indicatorCode,
      segmentCode,
      reportedPercentage: numberValue(row.reportedPercentage, row, 'reportedPercentage', errors, 'percentage'),
      respondentCount: numberValue(row.respondentCount, row, 'respondentCount', errors, 'integer'),
      earnedTotal,
      possibleTotal,
    };
  });

  const domainResults: SurveyExcelValidatedDomainResultRow[] = parsed.domainResults.map((row) => ({
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    domainCode: codeValue(row.domainCode, row, 'domainCode', errors) || '',
    segmentCode: codeValue(row.segmentCode, row, 'segmentCode', errors) || '',
    scorePercentage: numberValue(row.scorePercentage, row, 'scorePercentage', errors, 'percentage'),
    respondentCount: numberValue(row.respondentCount, row, 'respondentCount', errors, 'integer'),
    isComparable: booleanValue(row.isComparable, row, 'isComparable', errors),
  }));

  const comparisons: SurveyExcelValidatedComparisonRow[] = parsed.comparisons.map((row) => ({
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    domainCode: codeValue(row.domainCode, row, 'domainCode', errors) || '',
    segmentCode: codeValue(row.segmentCode, row, 'segmentCode', errors) || '',
    comparisonType: codeValue(row.comparisonType, row, 'comparisonType', errors) || '',
    comparisonCode: codeValue(row.comparisonCode, row, 'comparisonCode', errors, true),
    comparisonValue: numberValue(row.comparisonValue, row, 'comparisonValue', errors, 'percentage'),
    comparisonRoundCode: codeValue(row.comparisonRoundCode, row, 'comparisonRoundCode', errors, true),
    noteAr: textValue(row.noteAr),
    noteHe: textValue(row.noteHe),
  }));

  const participation: SurveyExcelValidatedParticipationRow[] = parsed.participation.map((row) => ({
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    segmentCode: codeValue(row.segmentCode, row, 'segmentCode', errors) || '',
    participantCount: numberValue(row.participantCount, row, 'participantCount', errors, 'integer'),
    eligibleCount: numberValue(row.eligibleCount, row, 'eligibleCount', errors, 'integer'),
    responseRate: numberValue(row.responseRate, row, 'responseRate', errors, 'percentage'),
  }));

  findDuplicates(indicatorResults, indicatorResults.map((row) => row.indicatorCode && row.segmentCode ? `${row.indicatorCode}|${row.segmentCode}` : null), errors, 'indicatorCode + segmentCode');
  findDuplicates(domainResults, domainResults.map((row) => row.domainCode && row.segmentCode ? `${row.domainCode}|${row.segmentCode}` : null), errors, 'domainCode + segmentCode');
  findDuplicates(comparisons, comparisons.map((row) => row.domainCode && row.segmentCode && row.comparisonType ? `${row.domainCode}|${row.segmentCode}|${row.comparisonType}` : null), errors, 'domainCode + segmentCode + comparisonType');
  findDuplicates(participation, participation.map((row) => row.segmentCode || null), errors, 'segmentCode');

  return { workbook: { indicatorResults, domainResults, comparisons, participation }, errors };
}
