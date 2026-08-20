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
    const user = await prisma.user.findFirst({
      where: {
        id: req.user.uid,
        normalizedEmail: String(req.user.email || '').trim().toLowerCase(),
        isActive: true,
      },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Authenticated user not found' });
    }

    const membership = await prisma.institutionUser.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        archivedAt: null,
        ...(requestedInstitutionId && isUuid(requestedInstitutionId)
          ? { institutionId: requestedInstitutionId }
          : {}),
      },
      select: { id: true, institutionId: true },
    });

    if (!membership) {
      console.warn(`[Tenant Isolation Blocked] User ${user.email} has no active institution membership.`);
      return res.status(403).json({ error: 'Unauthorized institution access' });
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
