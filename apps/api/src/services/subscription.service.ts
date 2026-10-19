import { lockSchoolInstitution } from '../db/school-runtime.repository';
import { NextFunction, Response } from 'express';
import { getRequestTransaction, prisma } from '../db/prisma';
import { platformPrisma } from '../db/platform-prisma';
import { getInstitutionUsage } from '../db/platform-metrics.repository';
import type { ContextRequest } from '../middleware/context';

export type SubscriptionResource = 'students' | 'staff' | 'users';

export interface InstitutionSubscriptionState {
  subscription: any | null;
  plan: any | null;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED' | 'NO_SUBSCRIPTION';
  isActive: boolean;
  limits: { maxStudents: number | null; maxStaff: number | null; maxUsers: number | null };
  usage: { students: number; staff: number; users: number };
}

function effectiveStatus(subscription: any, now = new Date()): InstitutionSubscriptionState['status'] {
  if (subscription.endsAt && subscription.endsAt <= now) return 'EXPIRED';
  if (subscription.status === 'TRIAL' && subscription.trialEndsAt && subscription.trialEndsAt <= now) return 'EXPIRED';
  return subscription.status;
}

type SubscriptionDatabase = Pick<typeof prisma, 'institutionSubscription' | 'student' | 'staffMember' | 'institutionUser'>;

export async function getEffectiveSubscriptionState(
  institutionId: string,
  database: SubscriptionDatabase = prisma,
  usageReader?: typeof getInstitutionUsage,
): Promise<InstitutionSubscriptionState> {
  const subscription = await database.institutionSubscription.findFirst({
    where: { institutionId },
    include: { plan: true },
    orderBy: { startsAt: 'desc' },
  });

  if (subscription && !subscription.plan) {
    throw new Error('Subscription configuration is missing its required plan relation.');
  }

  const plan = subscription?.plan ?? null;
  const status = subscription ? effectiveStatus(subscription) : 'NO_SUBSCRIPTION';
  const isActive = status === 'TRIAL' || status === 'ACTIVE' || status === 'PAST_DUE';
  const limits = {
    maxStudents: plan?.maxStudents ?? null,
    maxStaff: plan?.maxStaff ?? null,
    maxUsers: plan?.maxUsers ?? null,
  };
  const { students, staff, users } = usageReader
    ? await usageReader(institutionId)
    : await (async () => {
      const [studentCount, staffCount, userCount] = await Promise.all([
        database.student.count({ where: { institutionId, isActive: true } }),
        database.staffMember.count({ where: { institutionId, archivedAt: null } }),
        database.institutionUser.count({ where: { institutionId, isActive: true, archivedAt: null } }),
      ]);
      return { students: studentCount, staff: staffCount, users: userCount };
    })();
  return { subscription, plan, status, isActive, limits, usage: { students, staff, users } };
}

/** Platform reads the same business contract through aggregate-only SQL. */
export function getPlatformEffectiveSubscriptionState(institutionId: string): Promise<InstitutionSubscriptionState> {
  return getEffectiveSubscriptionState(institutionId, platformPrisma, getInstitutionUsage);
}

// Compatibility alias for existing controllers and callers. The effective
// service remains the single source of truth for subscription decisions.
export const getInstitutionSubscriptionState = getEffectiveSubscriptionState;

function inactiveSubscriptionCode(state: InstitutionSubscriptionState): string {
  return state.status === 'NO_SUBSCRIPTION' ? 'NO_SUBSCRIPTION' : 'SUBSCRIPTION_INACTIVE';
}

export function createRequireActiveSubscription(database: SubscriptionDatabase = prisma) {
  return async (req: ContextRequest, res: Response, next: NextFunction): Promise<void> => {
    const institutionId = req.context?.institutionId || req.institutionId || '';
    if (!institutionId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const state = await getEffectiveSubscriptionState(institutionId, database);
    if (!state.isActive) {
      res.status(403).json({ code: inactiveSubscriptionCode(state), error: 'The institution subscription is not active.' });
      return;
    }
    next();
  };
}

export const requireActiveSubscription = createRequireActiveSubscription();

/** Serialize limit-increasing school writes on their stable institution row. */
export async function enforcePlanLimit(
  req: ContextRequest,
  res: Response,
  resource: SubscriptionResource,
  database: SubscriptionDatabase = prisma,
): Promise<boolean> {
  const institutionId = req.context?.institutionId || req.institutionId || '';
  if (!institutionId) {
    res.status(403).json({ error: 'Access denied.' });
    return false;
  }
  const tx = req.db || getRequestTransaction();
  if (!tx) throw new Error('Plan limit checks require a school request transaction.');
  // FOR NO KEY UPDATE serializes competing checks without blocking FK key-share locks.
  const locked = await lockSchoolInstitution(tx, institutionId);
  if (!locked) {
    res.status(403).json({ error: 'Access denied.' });
    return false;
  }
  const state = await getEffectiveSubscriptionState(institutionId, database);
  if (!state.isActive) {
    res.status(403).json({ code: inactiveSubscriptionCode(state), error: 'The institution subscription is not active.' });
    return false;
  }
  const limitKey = resource === 'students' ? 'maxStudents' : resource === 'staff' ? 'maxStaff' : 'maxUsers';
  const limit = state.limits[limitKey];
  if (limit !== null && state.usage[resource] >= limit) {
    res.status(403).json({ code: 'PLAN_LIMIT_REACHED', resource, limit, usage: state.usage[resource], error: `The ${resource} plan limit has been reached.` });
    return false;
  }
  return true;
}

export function checkPlanLimit(resource: SubscriptionResource, database: SubscriptionDatabase = prisma) {
  return async (req: ContextRequest, res: Response, next: NextFunction): Promise<void> => {
    if (await enforcePlanLimit(req, res, resource, database)) next();
  };
}
