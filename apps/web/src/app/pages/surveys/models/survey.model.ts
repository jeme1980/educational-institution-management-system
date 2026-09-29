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
