export interface StaffMember {
  id: string;
  institutionId: string;
  nationalId?: string | null;
  firstNameAr: string;
  firstNameHe?: string | null;
  familyNameAr: string;
  familyNameHe?: string | null;
  genderId?: string | null;
  specializationId?: string | null;
  specialization?: { id: string; nameAr: string; nameHe?: string | null } | null;
  phoneNumber?: string | null;
  email?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface JobRole {
  id: string;
  institutionId: string;
  code: string;
  nameAr: string;
  nameHe?: string | null;
  descriptionAr?: string | null;
  descriptionHe?: string | null;
  isTeachingRole: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface StaffAssignment {
  id: string;
  institutionId: string;
  academicYearId: string;
  staffMemberId: string;
  jobRoleId: string;
  startDate: string;
  endDate?: string | null;
  isPrimary: boolean;
  isActive: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  staffFirstNameAr?: string;
  staffFamilyNameAr?: string;
  jobRoleNameAr?: string;
  academicYearLabel?: string;
  subjectIds?: string[];
  subjects?: { id: string; nameAr: string; nameHe?: string | null }[];
}
