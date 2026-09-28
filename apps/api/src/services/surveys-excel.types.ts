export const SURVEY_EXCEL_SHEET_NAMES = ['IndicatorResults', 'DomainResults', 'Comparisons', 'Participation'] as const;

export type SurveyExcelSheetName = typeof SURVEY_EXCEL_SHEET_NAMES[number];
export type SurveyExcelCellValue = string | number | boolean | null;

export const SURVEY_EXCEL_COLUMNS = {
  IndicatorResults: ['indicatorCode', 'segmentCode', 'reportedPercentage', 'respondentCount', 'earnedTotal', 'possibleTotal'],
  DomainResults: ['domainCode', 'segmentCode', 'scorePercentage', 'respondentCount', 'isComparable'],
  Comparisons: ['domainCode', 'segmentCode', 'comparisonType', 'comparisonCode', 'comparisonValue', 'comparisonRoundCode', 'noteAr', 'noteHe'],
  Participation: ['segmentCode', 'participantCount', 'eligibleCount', 'responseRate'],
} as const satisfies Record<SurveyExcelSheetName, readonly string[]>;

export const SURVEY_EXCEL_REQUIRED_COLUMNS = {
  IndicatorResults: ['indicatorCode', 'segmentCode', 'reportedPercentage'],
  DomainResults: ['domainCode', 'segmentCode'],
  Comparisons: ['domainCode', 'segmentCode', 'comparisonType'],
  Participation: ['segmentCode'],
} as const satisfies Record<SurveyExcelSheetName, readonly string[]>;

export type SurveyExcelSource = { sourceSheet: SurveyExcelSheetName; sourceRow: number };

export interface SurveyExcelIndicatorResultRow extends SurveyExcelSource {
  indicatorCode: SurveyExcelCellValue;
  segmentCode: SurveyExcelCellValue;
  reportedPercentage: SurveyExcelCellValue;
  respondentCount: SurveyExcelCellValue;
  earnedTotal: SurveyExcelCellValue;
  possibleTotal: SurveyExcelCellValue;
}

export interface SurveyExcelDomainResultRow extends SurveyExcelSource {
  domainCode: SurveyExcelCellValue;
  segmentCode: SurveyExcelCellValue;
  scorePercentage: SurveyExcelCellValue;
  respondentCount: SurveyExcelCellValue;
  isComparable: SurveyExcelCellValue;
}

export interface SurveyExcelComparisonRow extends SurveyExcelSource {
  domainCode: SurveyExcelCellValue;
  segmentCode: SurveyExcelCellValue;
  comparisonType: SurveyExcelCellValue;
  comparisonCode: SurveyExcelCellValue;
  comparisonValue: SurveyExcelCellValue;
  comparisonRoundCode: SurveyExcelCellValue;
  noteAr: SurveyExcelCellValue;
  noteHe: SurveyExcelCellValue;
}

export interface SurveyExcelParticipationRow extends SurveyExcelSource {
  segmentCode: SurveyExcelCellValue;
  participantCount: SurveyExcelCellValue;
  eligibleCount: SurveyExcelCellValue;
  responseRate: SurveyExcelCellValue;
}

export interface SurveyExcelParsedWorkbook {
  sheetNames: string[];
  headers: Record<SurveyExcelSheetName, string[]>;
  indicatorResults: SurveyExcelIndicatorResultRow[];
  domainResults: SurveyExcelDomainResultRow[];
  comparisons: SurveyExcelComparisonRow[];
  participation: SurveyExcelParticipationRow[];
}

export interface SurveyExcelValidatedIndicatorResultRow extends SurveyExcelSource {
  indicatorCode: string;
  segmentCode: string;
  reportedPercentage: number | null;
  respondentCount: number | null;
  earnedTotal: number | null;
  possibleTotal: number | null;
}

export interface SurveyExcelValidatedDomainResultRow extends SurveyExcelSource {
  domainCode: string;
  segmentCode: string;
  scorePercentage: number | null;
  respondentCount: number | null;
  isComparable: boolean | null;
}

export interface SurveyExcelValidatedComparisonRow extends SurveyExcelSource {
  domainCode: string;
  segmentCode: string;
  comparisonType: string;
  comparisonCode: string | null;
  comparisonValue: number | null;
  comparisonRoundCode: string | null;
  noteAr: string | null;
  noteHe: string | null;
}

export interface SurveyExcelValidatedParticipationRow extends SurveyExcelSource {
  segmentCode: string;
  participantCount: number | null;
  eligibleCount: number | null;
  responseRate: number | null;
}

export interface SurveyExcelValidatedWorkbook {
  indicatorResults: SurveyExcelValidatedIndicatorResultRow[];
  domainResults: SurveyExcelValidatedDomainResultRow[];
  comparisons: SurveyExcelValidatedComparisonRow[];
  participation: SurveyExcelValidatedParticipationRow[];
}

export type SurveyExcelErrorCode =
  | 'MALFORMED_WORKBOOK'
  | 'FORMULA_NOT_ALLOWED'
  | 'MISSING_SHEET'
  | 'UNKNOWN_SHEET'
  | 'MISSING_REQUIRED_COLUMN'
  | 'DUPLICATE_COLUMN'
  | 'UNKNOWN_COLUMN'
  | 'PII_COLUMN_NOT_ALLOWED'
  | 'EMPTY_CODE'
  | 'INVALID_PERCENTAGE'
  | 'INVALID_INTEGER'
  | 'INVALID_NUMBER'
  | 'INVALID_BOOLEAN'
  | 'EARNED_EXCEEDS_POSSIBLE'
  | 'DUPLICATE_ROW';

export interface SurveyExcelValidationError {
  sheet: string;
  row: number;
  column: string;
  code: SurveyExcelErrorCode;
  message: string;
}

export interface SurveyExcelValidationResult {
  workbook: SurveyExcelValidatedWorkbook;
  errors: SurveyExcelValidationError[];
}

export const SURVEY_EXCEL_COMPARISON_TYPES = ['PREVIOUS_ROUND', 'SIMILAR_SCHOOLS', 'EXTERNAL_BENCHMARK'] as const;
export type SurveyExcelComparisonType = typeof SURVEY_EXCEL_COMPARISON_TYPES[number];

export type SurveyExcelSemanticErrorCode =
  | 'SURVEY_NOT_FOUND'
  | 'SURVEY_ARCHIVED'
  | 'SURVEY_ROUND_NOT_FOUND'
  | 'UNKNOWN_INDICATOR_CODE'
  | 'UNKNOWN_DOMAIN_CODE'
  | 'UNKNOWN_SEGMENT_CODE'
  | 'UNKNOWN_COMPARISON_ROUND_CODE'
  | 'INVALID_COMPARISON_TYPE';

export interface SurveyExcelSemanticError {
  sheet: string;
  row: number;
  column: string;
  code: SurveyExcelSemanticErrorCode;
  message: string;
  scope: 'CONTEXT' | 'ROW';
}

export interface SurveyExcelSemanticPreviewInput {
  institutionId: string;
  surveyId: string;
  roundId: string;
  workbook: SurveyExcelValidatedWorkbook;
}

export interface SurveyExcelResolvedSurvey {
  id: string;
  institutionId: string;
  academicYearId: string;
  status: string;
  archivedAt: Date | null;
}

export interface SurveyExcelResolvedRound {
  id: string;
  institutionId: string;
  academicYearId: string;
  surveyId: string;
  code: string;
  status: string;
}

interface SurveyExcelResolvedRowContext {
  institutionId: string;
  academicYearId: string;
  surveyId: string;
  roundId: string;
}

export interface SurveyExcelResolvedIndicatorResultRow extends SurveyExcelValidatedIndicatorResultRow, SurveyExcelResolvedRowContext {
  sectionId: string;
  domainId: string;
  indicatorId: string;
  segmentId: string;
}

export interface SurveyExcelResolvedDomainResultRow extends SurveyExcelValidatedDomainResultRow, SurveyExcelResolvedRowContext {
  domainId: string;
  segmentId: string;
}

export interface SurveyExcelResolvedComparisonRow extends SurveyExcelValidatedComparisonRow, SurveyExcelResolvedRowContext {
  domainId: string;
  segmentId: string;
  comparisonRoundId: string | null;
}

export interface SurveyExcelResolvedParticipationRow extends SurveyExcelValidatedParticipationRow, SurveyExcelResolvedRowContext {
  segmentId: string;
}

export interface SurveyExcelSemanticPreviewSummary {
  indicatorRowsTotal: number;
  indicatorRowsValid: number;
  domainRowsTotal: number;
  domainRowsValid: number;
  comparisonRowsTotal: number;
  comparisonRowsValid: number;
  participationRowsTotal: number;
  participationRowsValid: number;
  errorCount: number;
}

export interface SurveyExcelSemanticPreview {
  survey: SurveyExcelResolvedSurvey | null;
  round: SurveyExcelResolvedRound | null;
  indicatorResults: SurveyExcelResolvedIndicatorResultRow[];
  domainResults: SurveyExcelResolvedDomainResultRow[];
  comparisons: SurveyExcelResolvedComparisonRow[];
  participation: SurveyExcelResolvedParticipationRow[];
  errors: SurveyExcelSemanticError[];
  summary: SurveyExcelSemanticPreviewSummary;
}

export type SurveyExcelPreflightErrorCode = SurveyExcelSemanticErrorCode | 'SURVEY_ROUND_RESULTS_ALREADY_EXIST';

export interface SurveyExcelPreflightError {
  sheet: string;
  row: number;
  column: string;
  code: SurveyExcelPreflightErrorCode;
  message: string;
  scope: 'CONTEXT' | 'ROW' | 'PREFLIGHT';
}

export interface SurveyExcelImportPreflightInput {
  institutionId: string;
  surveyId: string;
  roundId: string;
  fileBuffer: Uint8Array;
  preview: SurveyExcelSemanticPreview;
}

export interface SurveyExcelImportPreflight {
  surveyId: string;
  roundId: string;
  academicYearId: string | null;
  fileHash: string;
  hasExistingResults: boolean;
  duplicateImportFound: boolean;
  canImport: boolean;
  errors: SurveyExcelPreflightError[];
}

export type SurveyExcelImportErrorCode =
  | 'SURVEY_NOT_FOUND'
  | 'SURVEY_ARCHIVED'
  | 'SURVEY_ROUND_NOT_FOUND'
  | 'SURVEY_IMPORT_PREVIEW_INVALID'
  | 'SURVEY_IMPORT_EMPTY'
  | 'SURVEY_IMPORT_DUPLICATE_FILE'
  | 'SURVEY_ROUND_RESULTS_ALREADY_EXIST';

export interface SurveyExcelImportInput {
  institutionId: string;
  surveyId: string;
  roundId: string;
  userId: string;
  originalFileName: string;
  fileBuffer: Uint8Array;
  preview: SurveyExcelSemanticPreview;
}

export interface SurveyExcelImportResult {
  importBatchId: string;
  institutionId: string;
  academicYearId: string;
  surveyId: string;
  roundId: string;
  status: 'COMPLETED';
  fileHash: string;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  importedAt: Date;
}
