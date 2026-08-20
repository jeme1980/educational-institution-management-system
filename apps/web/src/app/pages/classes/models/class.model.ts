export interface ClassItem {
  id: string;
  institutionId: string;
  academicYearId: string;
  stageId: string;
  gradeLevelId: string;
  parallelNumber: number;
  classCode?: string | null;
  nameAr: string;
  nameHe?: string | null;
  typeId: string;
  compositionId: string;
  stage?: { id: string; nameAr: string } | null;
  gradeLevel?: string;
  gradeLevelInfo?: { id: string; codeNumber: number; nameAr: string } | null;
  type?: { id: string; nameAr: string } | null;
  composition?: { id: string; nameAr: string } | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}
