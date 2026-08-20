export interface User {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: string;
  institutionId?: string;
  isActive: boolean;
  isPlatformAdmin?: boolean;
  photoUrl?: string;
}

export interface InstitutionUser {
  id: string;
  institutionId: string;
  userId: string;
  staffMemberId: string;
  isActive: boolean;
}

import type { AcademicYear } from '../../pages/academic-years/models/academic-year.model';
export type { AcademicYear };

export interface Permission {
  id: string;
  code: string;
  module: string;
  action: string;
  nameAr: string;
  nameHe?: string;
  descriptionAr?: string;
  descriptionHe?: string;
  isActive: boolean;
}

export interface StaffMember {
  id: string;
  institutionId: string;
  nationalId?: string;
  firstNameAr: string;
  firstNameHe?: string;
  familyNameAr: string;
  familyNameHe?: string;
  genderId?: string;
  jobTitleAr?: string;
  jobTitleHe?: string;
}

export interface UserContext {
  user: User;
  institutionId: string;
  academicYear: AcademicYear | null;
  staffMember: StaffMember | null;
  permissions: string[];
  isPlatformAdmin?: boolean;
}
