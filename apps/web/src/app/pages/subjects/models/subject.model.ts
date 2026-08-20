export interface SubjectItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  nameAr: string;
  nameHe?: string | null;
  isActive: boolean;
  archivedAt?: string | null;
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
