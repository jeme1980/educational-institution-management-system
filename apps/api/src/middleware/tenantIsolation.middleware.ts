import { findAuthIdentityStateById, identityMemberships } from '../db/auth-runtime.repository';
import { Response, NextFunction } from 'express';
import { ContextRequest } from './context';
import { prisma } from '../db/prisma';
import { withRlsContext } from './rls-request.middleware';

const isUuid = (value: string | undefined) => Boolean(
  value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
);

/** Resolve the tenant and academic year from the authenticated local user. */
export async function tenantIsolationMiddleware(
  req: ContextRequest,
  res: Response,
  next: NextFunction,
): Promise<any> {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication is required.' });
  }

  try {
    const requestedInstitutionId = req.institutionId || req.context?.institutionId || '';
    const identity = await findAuthIdentityStateById(req.user.uid);
    const user = identity?.isActive && identity.normalizedEmail === String(req.user.email || '').trim().toLowerCase() ? identity : null;

    if (!user) {
      return res.status(401).json({ error: 'Authenticated user not found' });
    }

    const membership = (await identityMemberships(user.id)).find(m => m.isActive && !m.archivedAt && (!requestedInstitutionId || !isUuid(requestedInstitutionId) || m.institutionId === requestedInstitutionId));

    if (!membership) {
      console.warn(`[Tenant Isolation Blocked] User ${user.email} has no active institution membership.`);
      return res.status(403).json({ error: 'Unauthorized institution access' });
    }

    if (membership.institution.archivedAt) {
      return res.status(403).json({ error: 'This institution is archived and unavailable for school operations.', code: 'INSTITUTION_ARCHIVED' });
    }

    if (requestedInstitutionId && requestedInstitutionId !== membership.institutionId) {
      return res.status(403).json({ error: 'The requested institution is not assigned to this user.' });
    }

    const requestedAcademicYearId = req.context?.academicYearId || '';
    const academicYear = await withRlsContext(membership.institutionId, () => requestedAcademicYearId
      ? prisma.academicYear.findFirst({
        where: { id: requestedAcademicYearId, institutionId: membership.institutionId, archivedAt: null },
        select: { id: true },
      })
      : prisma.academicYear.findFirst({
        where: { institutionId: membership.institutionId, isCurrent: true, archivedAt: null },
        select: { id: true },
      }));

    if (requestedAcademicYearId && !academicYear) {
      return res.status(403).json({ error: 'The requested academic year is not assigned to this institution.' });
    }

    req.institutionId = membership.institutionId;
    req.academicYearId = academicYear?.id;
    req.context = { institutionId: membership.institutionId, academicYearId: academicYear?.id || '' };
    req.user = { ...req.user, institutionId: membership.institutionId, academicYearId: academicYear?.id };

    return next();
  } catch (error) {
    console.error('Error verifying tenant isolation membership:', error);
    return res.status(500).json({ error: 'Internal error verifying institution access' });
  }
}
