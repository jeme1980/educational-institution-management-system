import type { SubscriptionStatus } from '@prisma/client';
import { platformPrisma } from '../db/platform-prisma';
import { recordPlatformAuditEvent } from './platform-audit.service';

const currentStatuses: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];
const transitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIAL: ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
  CANCELLED: [],
  EXPIRED: [],
};

export async function assignPlatformSubscription(input: { institutionId: string; planId: string; status?: SubscriptionStatus; startsAt?: Date; endsAt?: Date | null; trialEndsAt?: Date | null; actorUserId?: string | null }) {
  return platformPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', input.institutionId);
    const [institution, plan] = await Promise.all([
      tx.institution.findUnique({ where: { id: input.institutionId }, select: { id: true } }),
      tx.plan.findUnique({ where: { id: input.planId }, select: { id: true, isActive: true } }),
    ]);
    if (!institution) throw Object.assign(new Error('Institution not found.'), { statusCode: 404 });
    if (!plan || !plan.isActive) throw Object.assign(new Error('Plan not found or inactive.'), { statusCode: 400 });
    const active = await tx.institutionSubscription.findFirst({ where: { institutionId: input.institutionId, status: { in: currentStatuses } }, orderBy: { startsAt: 'desc' } });
    if (active) await tx.institutionSubscription.update({ where: { id: active.id }, data: { status: 'EXPIRED', endsAt: input.startsAt || new Date() } });
    const subscription = await tx.institutionSubscription.create({ data: { institutionId: input.institutionId, planId: input.planId, status: input.status || 'ACTIVE', startsAt: input.startsAt || new Date(), endsAt: input.endsAt || null, trialEndsAt: input.trialEndsAt || null }, include: { plan: true } });
    await recordPlatformAuditEvent({ actorUserId: input.actorUserId, action: 'SUBSCRIPTION_ASSIGNED', entityType: 'InstitutionSubscription', entityId: subscription.id, targetInstitutionId: input.institutionId, targetPlanId: input.planId, metadata: { previousSubscriptionId: active?.id || null, status: subscription.status } }, tx);
    return subscription;
  });
}

export async function transitionPlatformSubscription(input: { institutionId: string; status: SubscriptionStatus; actorUserId?: string | null; endsAt?: Date | null }) {
  return platformPrisma.$transaction(async (tx) => {
    const current = await tx.institutionSubscription.findFirst({ where: { institutionId: input.institutionId, status: { in: currentStatuses } }, orderBy: { startsAt: 'desc' } });
    if (!current) throw Object.assign(new Error('No current subscription exists.'), { statusCode: 404 });
    if (!transitions[current.status].includes(input.status)) throw Object.assign(new Error(`Invalid subscription transition: ${current.status} -> ${input.status}.`), { statusCode: 400 });
    const updated = await tx.institutionSubscription.update({ where: { id: current.id }, data: { status: input.status, endsAt: input.endsAt === undefined ? current.endsAt : input.endsAt }, include: { plan: true } });
    await recordPlatformAuditEvent({ actorUserId: input.actorUserId, action: `SUBSCRIPTION_${input.status}`, entityType: 'InstitutionSubscription', entityId: current.id, targetInstitutionId: input.institutionId, targetPlanId: current.planId, metadata: { previousStatus: current.status, status: input.status } }, tx);
    return updated;
  });
}

export async function renewPlatformSubscription(input: { institutionId: string; endsAt: Date; actorUserId?: string | null }) {
  return platformPrisma.$transaction(async (tx) => {
    const current = await tx.institutionSubscription.findFirst({ where: { institutionId: input.institutionId, status: { in: currentStatuses } }, orderBy: { startsAt: 'desc' } });
    if (!current) throw Object.assign(new Error('No current subscription exists.'), { statusCode: 404 });
    if (input.endsAt <= current.startsAt) throw Object.assign(new Error('The subscription end date must be after its start date.'), { statusCode: 400 });
    const updated = await tx.institutionSubscription.update({ where: { id: current.id }, data: { endsAt: input.endsAt, status: current.status === 'SUSPENDED' ? 'ACTIVE' : current.status }, include: { plan: true } });
    await recordPlatformAuditEvent({ actorUserId: input.actorUserId, action: 'SUBSCRIPTION_RENEWED', entityType: 'InstitutionSubscription', entityId: current.id, targetInstitutionId: input.institutionId, targetPlanId: current.planId, metadata: { endsAt: input.endsAt.toISOString() } }, tx);
    return updated;
  });
}
