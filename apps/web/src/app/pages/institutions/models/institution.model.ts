export interface InstitutionLookup {
  id: string;
  nameAr: string;
  nameHe?: string | null;
  nativeName?: string;
  direction?: string;
}

export interface InstitutionItem {
  id: string;
  schoolCode: string;
  slug: string;
  nameAr: string;
  nameHe?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  typeId: string;
  regionId: string;
  townId?: string | null;
  statusId: string;
  defaultLanguageId: string;
  logoUrl?: string | null;
  brandingSettings?: Record<string, unknown> | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  type?: InstitutionLookup | null;
  region?: InstitutionLookup | null;
  town?: InstitutionLookup | null;
  status?: InstitutionLookup & { isActive?: boolean; allowsLogin?: boolean; allowsWrites?: boolean } | null;
  defaultLanguage?: InstitutionLookup | null;
  _count?: { academicYears: number; students: number; staffMembers: number; classes: number; studyGroups: number };
}
