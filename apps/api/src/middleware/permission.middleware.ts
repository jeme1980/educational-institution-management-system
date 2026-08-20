import { Response, NextFunction } from 'express';
import { ContextRequest } from './context';
import { prisma } from '../db/prisma';

type PermissionAction = 'read' | 'create' | 'update' | 'delete';

/**
 * Authorize against the persisted InstitutionUser -> Role -> Permission graph.
 * This middleware deliberately does not trust role names, JWT claims, headers,
 * local storage, or frontend permission checks.
 */
export function requirePermission(module: string, action: PermissionAction) {
  return async (req: ContextRequest, res: Response, next: NextFunction): Promise<any> => {
    const institutionId = req.context?.institutionId || req.institutionId || '';
    const userId = req.user?.uid;
    if (!userId || !institutionId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    try {
      const assignment = await prisma.institutionUserRole.findFirst({
        where: {
          institutionId,
          institutionUser: {
            userId,
            institutionId,
            isActive: true,
            archivedAt: null,
          },
          role: {
            institutionId,
            isActive: true,
            archivedAt: null,
            rolePermissions: {
              some: {
                institutionId,
                permission: {
                  module,
                  action: action.toUpperCase(),
                  isActive: true,
                },
              },
            },
          },
        },
        select: { id: true },
      });

      if (!assignment) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      return next();
    } catch (error) {
      console.error('Error checking permission:', error);
      return res.status(500).json({ error: 'Unable to verify access permissions.' });
    }
  };
}
