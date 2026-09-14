import { Town } from '../../pages/towns/models/town.model';
import type { AcademicYear, AcademicPeriod, AcademicYearUpdatePayload, CloseAcademicYearResponse, AcademicYearActionResult, SetCurrentAcademicYearResponse } from '../../pages/academic-years/models/academic-year.model';
export type { Town };
export type { AcademicYear, AcademicPeriod, AcademicYearUpdatePayload, CloseAcademicYearResponse, AcademicYearActionResult, SetCurrentAcademicYearResponse };

export interface DashboardStats {
  institutionId: string;
  academicYearId: string | null;
  academicYearLabel: string | null;
  kpis: {
    activeStudents: number;
    staffMembers: number;
    classes: number;
    guardians: number;
  };
  studentsByGrade: {
    id: string;
    label: string;
    stage: string;
    count: number;
  }[];
  studentsByGender: {
    id: string;
    label: string;
    count: number;
  }[];
  enrollmentTrend: {
    academicYearId: string;
    yearLabel: string;
    count: number;
  }[];
  alerts: {
    studentsWithoutGuardian: number;
    studentsWithoutMedicalProfile: number;
    studentsWithSpecialNeeds: number;
  };
  recentEnrollments: {
    id: string;
    createdAt: string;
    studentName: string;
    className: string;
    gradeLabel: string;
    statusName: string;
  }[];
  studentsByFeature?: { id: string; label: string; count: number }[];
  studentsByEnrollmentStatus?: { id: string; label: string; count: number }[];
  studentsByTown?: { id: string; label: string; count: number }[];
  classDensity?: { id: string; label: string; stage: string; className: string; classCode: string | null; gradeCodeNumber: number; parallelNumber: number; count: number }[];
  staffByRole?: { id: string; label: string; isTeachingRole: boolean; count: number }[];
  subjectCoverage?: { total: number; assigned: number; unassigned: number };
  teacherStudentRatio?: { teachers: number; students: number; studentsPerTeacher: number };
  examStatus?: { id: string; label: string; count: number }[];
  performance?: { average: number; gradedStudents: number; bySubject: { id: string; label: string; average: number; count: number }[] };
  skillPerformance?: { id: string; label: string; average: number; count: number; kind: 'skill' | 'topic' }[];
  support?: { specialNeeds: number; medicalProfiles: number; allergiesOrChronic: number; guardiansLinked: number; guardianCoveragePercent: number };
}

export interface Student {
  id: string;
  institutionId: string;
  genderId?: string;
  studentStatusId: string;
  townId?: string;
  nationalId: string;
  firstNameAr: string;
  lastNameAr: string;
  firstNameHe?: string;
  lastNameHe?: string;
  birthDate?: string;
  photoUrl?: string;
  email?: string;
  phoneNumber?: string;
  addressAr?: string;
  addressHe?: string;
  town?: Town | null;
  notes?: string;
  /** Derived from the student's current enrollment for list views. */
  gradeLevel?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  versionNumber?: number;
  classId?: string;
  medicalProfile?: {
    bloodType?: string;
    allergiesDescription?: string;
    chronicConditions?: string;
    emergencyInstructions?: string;
    hasSpecialNeeds: boolean;
    specialNeedsNotes?: string;
  };
  guardian?: {
    firstNameAr: string;
    lastNameAr: string;
    firstNameHe?: string;
    lastNameHe?: string;
    primaryPhoneNumber: string;
    secondaryPhoneNumber?: string;
    email?: string;
    addressAr?: string;
    addressHe?: string;
    jobTitleAr?: string;
    jobTitleHe?: string;
  };
  relationTypeId?: string;
}

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
  jobTitleAr?: string | null;
  jobTitleHe?: string | null;
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

export interface StaffDevelopment {
  id: string;
  institutionId: string;
  staffMemberId: string;
  courseCode: string;
  courseName: string;
  providerId?: string | null;
  provider?: { id: string; providerCode: string; name: string } | null;
  hoursCount?: number | null;
  startDate: string;
  endDate: string;
  staffMember?: { id: string; firstNameAr: string; familyNameAr: string; nationalId?: string | null; specialization?: { id: string; nameAr: string; nameHe?: string | null } | null } | null;
}

export interface ClassItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  stageId: string;
  gradeLevelId: string;
  parallelNumber: number;
  /** Computed by the API as `${gradeLevel.codeNumber}-${parallelNumber}`. */
  classCode?: string | null;
  nameAr: string;
  nameHe?: string | null;
  typeId: string;
  compositionId: string;
  studentCount?: number;
  stage?: LookupItem | null;
  /** Display label normalized by ClassesApiService from Prisma's gradeLevel relation. */
  gradeLevel?: string;
  gradeLevelInfo?: GradeLevel | null;
  type?: LookupItem | null;
  composition?: LookupItem | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface LookupItem {
  id: string;
  nameAr: string;
  nameHe?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface GradeLevel extends LookupItem {
  codeNumber: number;
}

export interface ClassFormValue {
  institutionId: string;
  academicYearId: string;
  stageId: string;
  gradeLevelId: string;
  parallelNumber: number;
  /** Optional/read-only from the client; the API computes this value. */
  classCode?: string | null;
  nameAr: string;
  nameHe: string;
  typeId: string;
  compositionId: string;
}

export interface SubjectItem {
  id: string;
  /** Compatibility only for legacy API payloads; not persisted in Prisma. */
  code?: string;
  institutionId: string;
  academicYearId: string;
  nameAr: string;
  nameHe?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface TopicItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  subjectId: string;
  gradeLevelId: string;
  nameAr: string;
  nameHe?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  subjectNameAr?: string;
}

export interface SkillItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  subjectId: string;
  gradeLevelId: string;
  nameAr: string;
  nameHe?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  subjectNameAr?: string;
}

export interface ExamItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  academicPeriodId: string;
  subjectId: string;
  examTypeId: string;
  titleAr: string;
  titleHe?: string | null;
  examDate: string;
  maxScore: string | number;
  weight?: string | number | null;
  isPublished: boolean;
  notes?: string | null;
  archivedAt?: string | null;
  subject?: LookupItem | null;
  academicPeriod?: LookupItem | null;
  examType?: LookupItem | null;
  examGroups?: {
    studyGroupId: string;
    studyGroup: {
      classId?: string | null;
      staffAssignmentId?: string | null;
      classRoom?: { id: string; nameAr: string; gradeLevelId: string; gradeLevel?: { id: string; nameAr: string } | null } | null;
      staffAssignment?: { id: string; staffMemberId: string; staffMember?: { id: string; firstNameAr: string; familyNameAr: string } | null } | null;
    };
  }[];
  _count?: { studentExamResults: number; examQuestions: number; examGroups: number };
  metrics?: { expectedStudents: number; recordedStudents: number };
}
