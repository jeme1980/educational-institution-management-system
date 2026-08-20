export interface StudyGroupItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  classId?: string | null;
  subjectId: string;
  staffAssignmentId?: string | null;
  nameAr: string;
  nameHe?: string | null;
  isActive: boolean;
  archivedAt?: string | null;
  subject?: { id: string; nameAr: string; nameHe?: string | null } | null;
  classRoom?: { id: string; nameAr: string; gradeLevelId?: string; gradeLevel?: { id: string; nameAr: string } | null } | null;
  staffAssignment?: { id: string; staffMember?: { firstNameAr: string; familyNameAr: string } | null } | null;
  _count?: { students: number; examGroups: number };
}
