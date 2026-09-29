export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

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
