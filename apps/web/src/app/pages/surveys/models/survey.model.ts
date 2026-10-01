export const SURVEY_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'] as const;
export type SurveyStatus = typeof SURVEY_STATUSES[number];

const SURVEY_STATUS_TRANSITIONS: Record<SurveyStatus, readonly SurveyStatus[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['CLOSED'],
  CLOSED: [],
};

export function getAllowedSurveyStatusOptions(currentStatus: SurveyStatus | null): readonly SurveyStatus[] {
  if (!currentStatus) return SURVEY_STATUSES;
  return SURVEY_STATUSES.filter(status => status === currentStatus || SURVEY_STATUS_TRANSITIONS[currentStatus].includes(status));
}

/** GET /api/surveys returns this array directly, with no pagination wrapper. */
export interface SurveyListItem {
  id: string;
  academicYearId: string;
  nameAr: string;
  nameHe: string | null;
  descriptionAr: string | null;
  descriptionHe: string | null;
  audienceType: string | null;
  status: SurveyStatus;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
  domainCount: number;
  indicatorCount: number;
  roundCount: number;
  segmentCount: number;
}

export type SurveyListResponse = SurveyListItem[];

export type SurveyDetail = Omit<SurveyListItem, 'sectionCount' | 'domainCount' | 'indicatorCount' | 'roundCount' | 'segmentCount'>;

export interface CreateSurveyRequest {
  academicYearId: string;
  nameAr: string;
  nameHe?: string | null;
  descriptionAr?: string | null;
  descriptionHe?: string | null;
  audienceType?: string | null;
  status?: SurveyStatus;
}

export type UpdateSurveyRequest = Partial<Omit<CreateSurveyRequest, 'academicYearId'>> & { isActive?: boolean };

export const SURVEY_ROUND_STATUSES = ['PLANNED', 'OPEN', 'CLOSED'] as const;
export type SurveyRoundStatus = typeof SURVEY_ROUND_STATUSES[number];

export interface SurveyRound {
  id: string;
  surveyId: string;
  academicYearId: string;
  code: string;
  nameAr: string;
  nameHe: string | null;
  sequenceNumber: number;
  startsAt: string | null;
  endsAt: string | null;
  measurementDate: string | null;
  status: SurveyRoundStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyStructureResponse {
  survey: SurveyDetail;
  sections: SurveySection[];
  rounds: SurveyRound[];
  segments: SurveySegment[];
}

export interface SurveySegment {
  id: string;
  surveyId: string;
  code: string;
  nameAr: string;
  nameHe: string | null;
  segmentType: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateSurveySegmentRequest {
  code: string;
  nameAr: string;
  nameHe?: string | null;
  segmentType?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateSurveySegmentRequest = Partial<CreateSurveySegmentRequest>;

export interface SurveyResultsPreviewSummary {
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

export interface SurveyResultsPreviewError {
  sheet: string;
  row: number;
  column: string;
  code: string;
  message: string;
}

export interface SurveyResultsPreviewResponse {
  valid: boolean;
  context: { surveyId: string; roundId: string };
  summary: SurveyResultsPreviewSummary;
  errors: SurveyResultsPreviewError[];
}

export interface SurveyResultsImportResponse {
  importBatchId: string;
  surveyId: string;
  roundId: string;
  status: 'COMPLETED';
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  fileHash: string;
  importedAt: string;
}

export interface SurveyResultNamedItem { id: string; code: string; nameAr: string; nameHe: string | null }
export interface SurveyResultDomain extends SurveyResultNamedItem { section: SurveyResultNamedItem }
export interface SurveyRoundIndicatorResult {
  id: string;
  section: SurveyResultNamedItem;
  domain: SurveyResultDomain;
  indicator: { id: string; code: string; textAr: string; textHe: string | null };
  segment: SurveyResultNamedItem;
  reportedPercentage: number | null;
  respondentCount: number | null;
  earnedTotal: number | null;
  possibleTotal: number | null;
}
export interface SurveyRoundDomainResult {
  id: string;
  domain: SurveyResultDomain;
  segment: SurveyResultNamedItem;
  scorePercentage: number | null;
  respondentCount: number | null;
  isComparable: boolean;
}
export interface SurveyRoundComparison {
  id: string;
  domain: SurveyResultDomain;
  segment: SurveyResultNamedItem;
  comparisonType: string;
  comparisonCode: string | null;
  comparisonValue: number | null;
  comparisonRoundCode: string | null;
  noteAr: string | null;
  noteHe: string | null;
}
export interface SurveyRoundParticipationResult {
  id: string;
  segment: SurveyResultNamedItem;
  participantCount: number | null;
  eligibleCount: number | null;
  responseRate: number | null;
}
export interface SurveyRoundResultsImportMetadata {
  id: string;
  originalFileName: string;
  status: string;
  rowCount: number | null;
  importedAt: string | null;
}
export interface SurveyRoundResultsResponse {
  survey: Pick<SurveyDetail, 'id' | 'nameAr' | 'nameHe' | 'academicYearId' | 'archivedAt'>;
  round: Pick<SurveyRound, 'id' | 'code' | 'nameAr' | 'nameHe' | 'sequenceNumber' | 'status' | 'measurementDate'>;
  import: SurveyRoundResultsImportMetadata | null;
  indicatorResults: SurveyRoundIndicatorResult[];
  domainResults: SurveyRoundDomainResult[];
  comparisons: SurveyRoundComparison[];
  participation: SurveyRoundParticipationResult[];
}

export interface SurveyTrendRound {
  id: string; code: string; nameAr: string; nameHe: string | null;
  sequenceNumber: number; measurementDate: string | null; status: string;
}
export interface SurveyTrendSummary { firstValue: number | null; latestValue: number | null; changeFromFirst: number | null }
export interface SurveyTrendPoint { roundId: string; value: number | null; respondentCount: number | null; deltaFromPrevious: number | null }
export interface SurveyDomainTrendPoint extends SurveyTrendPoint { isComparable: boolean | null }
export interface SurveyParticipationTrendPoint { roundId: string; participantCount: number | null; eligibleCount: number | null; responseRate: number | null; deltaFromPrevious: number | null }
export interface SurveyIndicatorTrend extends SurveyTrendSummary {
  indicator: { id: string; code: string; textAr: string; textHe: string | null; isReverseDirection: boolean };
  domain: SurveyResultDomain; section: SurveyResultNamedItem; segment: SurveyResultNamedItem; points: SurveyTrendPoint[];
}
export interface SurveyDomainTrend extends SurveyTrendSummary {
  domain: SurveyResultDomain; section: SurveyResultNamedItem; segment: SurveyResultNamedItem; points: SurveyDomainTrendPoint[];
}
export interface SurveyParticipationTrend extends SurveyTrendSummary {
  segment: SurveyResultNamedItem; points: SurveyParticipationTrendPoint[];
}
export interface SurveyTrendsResponse {
  survey: Pick<SurveyDetail, 'id' | 'nameAr' | 'nameHe' | 'academicYearId' | 'archivedAt'>;
  rounds: SurveyTrendRound[];
  indicatorTrends: SurveyIndicatorTrend[];
  domainTrends: SurveyDomainTrend[];
  participationTrends: SurveyParticipationTrend[];
}

export interface SurveyReportedComparison {
  id: string;
  comparisonType: string;
  comparisonCode: string | null;
  comparisonValue: number | null;
  comparisonRoundCode: string | null;
  noteAr: string | null;
  noteHe: string | null;
}
export interface SurveyComparisonGroup {
  roundId: string;
  domainId: string;
  segmentId: string;
  section: SurveyResultNamedItem;
  domain: SurveyResultDomain;
  segment: SurveyResultNamedItem;
  domainResult: { id: string; scorePercentage: number | null; respondentCount: number | null; isComparable: boolean } | null;
  comparisons: SurveyReportedComparison[];
}
export interface SurveyComparisonsResponse {
  survey: Pick<SurveyDetail, 'id' | 'nameAr' | 'nameHe' | 'academicYearId' | 'archivedAt'>;
  rounds: SurveyTrendRound[];
  groups: SurveyComparisonGroup[];
}

export interface SurveyDomain {
  id: string;
  surveyId: string;
  sectionId: string;
  code: string;
  nameAr: string;
  nameHe: string | null;
  descriptionAr: string | null;
  descriptionHe: string | null;
  sortOrder: number;
  isActive: boolean;
  indicators: SurveyIndicator[];
}

export const SURVEY_INDICATOR_REPORTING_RULES = ['AGREEMENT_TOP_2', 'FREQUENCY_TOP_2', 'FREQUENCY_TOP_3', 'DIRECT_PERCENT'] as const;
export type SurveyIndicatorReportingRule = typeof SURVEY_INDICATOR_REPORTING_RULES[number];

export interface SurveyIndicator {
  id: string;
  surveyId: string;
  domainId: string;
  code: string;
  textAr: string;
  textHe: string | null;
  descriptionAr: string | null;
  descriptionHe: string | null;
  sortOrder: number;
  isActive: boolean;
  reportingRuleCode: SurveyIndicatorReportingRule | null;
  isReverseDirection: boolean;
}

export interface CreateSurveyIndicatorRequest {
  domainId: string;
  code: string;
  textAr: string;
  textHe?: string | null;
  descriptionAr?: string | null;
  descriptionHe?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  reportingRuleCode?: SurveyIndicatorReportingRule | null;
  isReverseDirection?: boolean;
}

export type UpdateSurveyIndicatorRequest = Partial<CreateSurveyIndicatorRequest>;

export interface SurveySection {
  id: string;
  surveyId: string;
  code: string;
  nameAr: string;
  nameHe: string | null;
  descriptionAr: string | null;
  descriptionHe: string | null;
  sortOrder: number;
  isOptional: boolean;
  isActive: boolean;
  domains: SurveyDomain[];
}

export interface CreateSurveySectionRequest {
  code: string;
  nameAr: string;
  nameHe?: string | null;
  descriptionAr?: string | null;
  descriptionHe?: string | null;
  sortOrder?: number;
  isOptional?: boolean;
  isActive?: boolean;
}

export type UpdateSurveySectionRequest = Partial<CreateSurveySectionRequest>;

export interface CreateSurveyDomainRequest {
  sectionId: string;
  code: string;
  nameAr: string;
  nameHe?: string | null;
  descriptionAr?: string | null;
  descriptionHe?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateSurveyDomainRequest = Partial<CreateSurveyDomainRequest>;

export interface CreateSurveyRoundRequest {
  code: string;
  nameAr: string;
  nameHe?: string | null;
  sequenceNumber: number;
  startsAt?: string | null;
  endsAt?: string | null;
  measurementDate?: string | null;
  status?: SurveyRoundStatus;
}

export type UpdateSurveyRoundRequest = Partial<CreateSurveyRoundRequest>;
