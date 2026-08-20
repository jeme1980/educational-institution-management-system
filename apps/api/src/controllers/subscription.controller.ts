import { Response } from 'express';
import type { ContextRequest } from '../middleware/context';
import { getInstitutionSubscriptionState } from '../services/subscription.service';

export async function getSubscription(req: ContextRequest, res: Response): Promise<void> {
  const institutionId = req.context?.institutionId || req.institutionId || '';
  const state = await getInstitutionSubscriptionState(institutionId);
  res.json({
    plan: state.plan,
    status: state.status,
    isActive: state.isActive,
    startsAt: state.subscription?.startsAt ?? null,
    endsAt: state.subscription?.endsAt ?? null,
    trialEndsAt: state.subscription?.trialEndsAt ?? null,
    limits: state.limits,
    usage: state.usage,
  });
}
