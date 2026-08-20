export type LookupTab = 'regions' | 'towns' | 'institutionStatuses' | 'languages' | 'educationTypes' | 'educationStages' | 'gradeLevels' | 'classTypes' | 'compositionTypes' | 'genders' | 'studentStatuses' | 'enrollmentStatuses' | 'relationTypes';

export interface UserAccountItem {
  id: string;
  institutionId: string;
  email: string;
  fullNameAr: string;
  fullNameHe?: string | null;
  role: string;
  isActive: boolean;
  createdAt?: string;
}

export interface RoleWithPermissions {
  id: string;
  code: string;
  nameAr: string;
  nameHe?: string;
  descriptionAr?: string;
  descriptionHe?: string;
  isSystem?: boolean;
  isActive?: boolean;
  permissionIds: string[];
}

export interface InstitutionUserExpanded {
  id: string;
  institutionId: string;
  userId: string;
  staffMemberId: string;
  isActive: boolean;
  user?: {
    id: string;
    email: string;
    displayName?: string;
    isActive?: boolean;
  };
  accountStatus?: 'PENDING_SETUP' | 'SETUP_EXPIRED' | 'ACTIVE' | 'DISABLED';
  setup?: { expiresAt: string } | null;
  staffMember?: {
    id: string;
    firstNameAr: string;
    familyNameAr: string;
    nationalId?: string;
  };
  roles?: {
    roleId: string;
    roleNameAr?: string;
  }[];
}
