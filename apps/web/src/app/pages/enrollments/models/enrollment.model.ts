export interface EnrollmentItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  studentId: string;
  classId: string;
  enrollmentStatusId: string;
  enrollmentNumber?: string | null;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  versionNumber?: number;
  isDeleted?: boolean;
  deletedAt?: string | null;
}
