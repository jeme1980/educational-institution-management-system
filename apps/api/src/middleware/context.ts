import { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';

export interface AppContext {
  institutionId: string;
  academicYearId: string;
}

export interface ContextRequest extends Request {
  user?: any;
  context?: AppContext;
  institutionId?: string;
  academicYearId?: string;
  db?: Prisma.TransactionClient;
}

export const DEFAULT_INSTITUTION_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_ACADEMIC_YEAR_ID = '00000000-0000-4000-8000-000000000007';

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/**
 * Middleware that records request hints. Protected requests replace them with
 * the trusted context resolved from the authenticated user's membership.
 */
export async function contextMiddleware(
  req: ContextRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Client headers are hints only; tenantIsolationMiddleware validates them.
    const requestedInstitution = (req.headers['x-institution-id'] as string) || (req.headers['X-Institution-Id'] as string);
    let instId = isUuid(requestedInstitution) ? requestedInstitution : '';

    // Do not infer an institution from a default or client-controlled state.

    // Academic year is also a hint until it is checked against the institution.
    const requestedYear = (req.headers['x-academic-year-id'] as string) || (req.headers['X-Academic-Year-Id'] as string);
    let yearId = isUuid(requestedYear) ? requestedYear : '';

    // Attach only request hints. Authentication middleware supplies trusted IDs.
    const context: AppContext = {
      institutionId: instId,
      academicYearId: yearId,
    };

    req.context = context;
    req.institutionId = instId;
    req.academicYearId = yearId;

    next();
  } catch (err) {
    console.error('Error resolving request context:', err);
    req.context = { institutionId: '', academicYearId: '' };
    req.institutionId = undefined;
    req.academicYearId = undefined;
    next();
  }
}
