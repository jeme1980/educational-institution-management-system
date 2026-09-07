export interface AcademicYear {
  id: string;
  institutionId: string;
  yearLabel: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isClosed: boolean;
  archivedAt?: string | null;
}

export interface AcademicYearUpdatePayload {
  yearLabel: string;
  startDate: string;
  endDate: string;
}

export interface CloseAcademicYearResponse { academicYear: AcademicYear; alreadyClosed: boolean; }
export type AcademicYearActionResult<T> = { success: true; data: T } | { success: false; error: string; code?: string };
export type SetCurrentAcademicYearResponse = AcademicYear;

export interface AcademicPeriod {
  id: string;
  institutionId: string;
  academicYearId: string;
  nameAr: string;
  nameHe?: string | null;
  startDate: string;
  endDate: string;
  sortOrder: number;
  isActive: boolean;
}
