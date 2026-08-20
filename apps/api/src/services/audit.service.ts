import { Prisma } from '@prisma/client';

type AuditDb = Prisma.TransactionClient | { auditLog: Prisma.TransactionClient['auditLog'] };

const SENSITIVE_KEYS = /password|token|secret|jwt|hash/i;

function safeMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) if (!SENSITIVE_KEYS.test(key)) output[key] = item;
  return output as Prisma.InputJsonValue;
}

export async function recordAuditEvent(
  db: AuditDb,
  event: { institutionId: string; actorUserId?: string | null; action: string; entityType: string; entityId?: string | null; metadata?: unknown },
): Promise<void> {
  await db.auditLog.createMany({ data: {
    institutionId: event.institutionId,
    actorUserId: event.actorUserId || null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId || null,
    metadata: safeMetadata(event.metadata),
  } });
}
