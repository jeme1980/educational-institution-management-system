import type { Prisma } from '@prisma/client';
import { getInstitutionUsage } from '../db/platform-metrics.repository';

type PlatformTransaction = Prisma.TransactionClient;
interface PlanLimits { maxStudents: number | null; maxStaff: number | null; maxUsers: number | null }
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** The target Plan is locked before an institution can join its subscriber set. */
export async function lockPlatformPlan(tx: PlatformTransaction, planId: string): Promise<boolean> {
  if (!uuid(planId)) return false;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM public.plans WHERE id = ${planId}::uuid FOR NO KEY UPDATE
  `;
  return rows.length === 1;
}

/** Match the school request's lock mode; callers lock Plan first. */
export async function lockPlatformInstitution(tx: PlatformTransaction, institutionId: string): Promise<boolean> {
  if (!uuid(institutionId)) return false;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM public.institutions WHERE id = ${institutionId}::uuid FOR NO KEY UPDATE
  `;
  return rows.length === 1;
}

export async function lockPlatformInstitutions(tx: PlatformTransaction, institutionIds: string[]): Promise<void> {
  for (const id of [...new Set(institutionIds)].sort()) {
    if (!await lockPlatformInstitution(tx, id)) throw Object.assign(new Error('Institution not found.'), { statusCode: 404 });
  }
}

/** Existing Plan-lowering payload, also used when assigning a target Plan. */
export async function assertPlanFitsInstitution(tx: PlatformTransaction, institutionId: string, limits: PlanLimits): Promise<void> {
  const usage = await getInstitutionUsage(institutionId, tx);
  for (const [field, count] of [
    ['maxStudents', usage.students], ['maxStaff', usage.staff], ['maxUsers', usage.users],
  ] as const) {
    const limit = limits[field];
    if (limit !== null && count > limit) {
      throw Object.assign(new Error(`${field} cannot be lower than current usage (${count}).`), {
        statusCode: 409, code: 'PLAN_LIMIT_BELOW_USAGE', field, currentUsage: count,
      });
    }
  }
}
