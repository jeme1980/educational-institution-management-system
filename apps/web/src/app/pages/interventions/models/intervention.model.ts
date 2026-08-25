export type InterventionStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type InterventionOutcome = 'improved' | 'declined' | 'noComparison';

export interface InterventionListItem {
  id: string;
  title: string;
  status: InterventionStatus;
  startDate: string;
  endDate?: string | null;
  plannedDuration?: string | null;
  subject?: { nameAr?: string } | null;
  studyGroup?: { nameAr?: string } | null;
  baselineExam?: { titleAr?: string; examDate?: string } | null;
  _count?: { students: number; skills: number };
}

export interface InterventionDetail extends InterventionListItem {
  activity?: string | null;
  successCriterion?: { targetMasteryPercentage?: number; displayText?: string } | null;
  students: Array<{ id: string; studentEnrollmentId: string; studentEnrollment?: { student?: { firstNameAr?: string; lastNameAr?: string } } }>;
  skills: Array<{ id: string; skillId: string; baselineMastery?: number | null; targetMastery?: number | null; skill?: { nameAr?: string } }>;
}
