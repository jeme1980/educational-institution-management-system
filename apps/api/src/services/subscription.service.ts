import { NextFunction, Response } from 'express';
import { prisma } from '../db/prisma';
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
  const [students, staff, users] = await Promise.all([
    database.student.count({ where: { institutionId, isActive: true } }),
    database.staffMember.count({ where: { institutionId, archivedAt: null } }),
    database.institutionUser.count({ where: { institutionId, isActive: true, archivedAt: null } }),
  ]);
  return { subscription, plan, status, isActive, limits, usage: { students, staff, users } };
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

export function checkPlanLimit(resource: SubscriptionResource, database: SubscriptionDatabase = prisma) {
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
    const limitKey = resource === 'students' ? 'maxStudents' : resource === 'staff' ? 'maxStaff' : 'maxUsers';
    const limit = state.limits[limitKey];
    if (limit !== null && state.usage[resource] >= limit) {
      res.status(403).json({ code: 'PLAN_LIMIT_REACHED', resource, limit, usage: state.usage[resource], error: `The ${resource} plan limit has been reached.` });
      return;
    }
    next();
  };
}
