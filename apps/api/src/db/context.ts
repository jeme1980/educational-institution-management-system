import { AppContext } from '../middleware/context';

/**
 * Automatically injects institutionId and academicYearId into creation payloads
 * prior to database insertion.
 */
export function injectContextForCreate<T extends Record<string, any>>(
  data: T,
  context: AppContext,
  options?: { includeAcademicYear?: boolean }
): T & { institutionId: string; academicYearId?: string } {
  const result: any = { ...data };

  // Server-side context override / injection
  result.institutionId = context.institutionId;

  if (options?.includeAcademicYear || ('academicYearId' in data && data['academicYearId'] === undefined) || options?.includeAcademicYear !== false) {
    if (options?.includeAcademicYear) {
      result.academicYearId = context.academicYearId;
    }
  }

  return result;
}

/**
 * Builds strict tenant isolation condition for UPDATE, DELETE, and GET operations.
 * Ensures operations target records filtered strictly by `id` AND `institutionId`
 * (and `academicYearId` when specified), preventing cross-tenant data leaks.
 */
