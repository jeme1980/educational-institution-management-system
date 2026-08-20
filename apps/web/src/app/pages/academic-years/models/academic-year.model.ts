export interface AcademicYear {
  id: string;
  institutionId: string;
  yearLabel: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isClosed: boolean;
}

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
