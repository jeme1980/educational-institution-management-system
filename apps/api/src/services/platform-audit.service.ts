import type { Prisma, PrismaClient } from '@prisma/client';
import { platformPrisma } from '../db/platform-prisma';

export async function recordPlatformAuditEvent(input: { actorUserId?: string | null; action: string; entityType: string; entityId?: string | null; targetInstitutionId?: string | null; targetPlanId?: string | null; metadata?: Prisma.InputJsonValue | null }, client: PrismaClient | Prisma.TransactionClient = platformPrisma): Promise<void> {
  const { metadata, ...rest } = input;
  await client.platformAuditLog.create({ data: metadata === null ? rest : { ...rest, ...(metadata === undefined ? {} : { metadata }) } });
}
