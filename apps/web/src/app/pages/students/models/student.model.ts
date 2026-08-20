import { Student } from '../../../core/services/api.service';

export type TabType = 'basic' | 'medical' | 'guardian';
export type DetailTabType = 'academic' | 'medical' | 'guardian' | 'grades' | 'attendance';

export interface Grade {
  id: string;
  studentId: string;
  examId: string;
  examTitle: string;
  maxScore: string | number;
  score: string | number | null;
  isAbsent: boolean;
  notes?: string | null;
  subjectName: string;
  date: string;
}

export interface Attendance {
  id: string;
  studentId: string;
  studentEnrollmentId?: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string | null;
}

export interface Guardian {
  id: string;
  institutionId: string;
  nationalId?: string | null;
  firstNameAr: string;
  lastNameAr: string;
  firstNameHe?: string | null;
  lastNameHe?: string | null;
  primaryPhoneNumber: string;
  secondaryPhoneNumber?: string | null;
  email?: string | null;
  addressAr?: string | null;
  addressHe?: string | null;
  jobTitleAr?: string | null;
  jobTitleHe?: string | null;
}

export interface StudentGuardian {
  id: string;
  studentId: string;
  guardianId: string;
  relationTypeId: string;
  isPrimaryContact: boolean;
  isFinancialResponsible: boolean;
  hasCustody: boolean;
  canPickup: boolean;
  guardian: Guardian;
  relationType?: { id: string; nameAr?: string; nameHe?: string | null };
}

export interface MedicalProfile {
  id?: string;
  bloodType?: string | null;
  allergiesDescription?: string | null;
  chronicConditions?: string | null;
  emergencyInstructions?: string | null;
  hasSpecialNeeds?: boolean;
  specialNeedsNotes?: string | null;
}

export interface ToastState {
  type: 'success' | 'error' | 'info';
  message: string;
}
