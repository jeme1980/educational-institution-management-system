import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';

const SENSITIVE_METADATA_KEY = /password|token|secret|jwt|hash|medical|diagnosis|allergy|medication|condition/i;

function safeAuditMetadata(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(safeAuditMetadata);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE_METADATA_KEY.test(key))
    .map(([key, item]) => [key, safeAuditMetadata(item)]));
}

export async function getAuditLogs(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));
  const action = String(req.query.action || '').trim();
  const entityType = String(req.query.entityType || '').trim();
  const actorUserId = String(req.query.actor || '').trim();
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const where = { institutionId, ...(action ? { action } : {}), ...(entityType ? { entityType } : {}), ...(actorUserId ? { actorUserId } : {}), ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
  ]);
  return res.json({ items: items.map((item) => ({ ...item, metadata: safeAuditMetadata(item.metadata) })), page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
}

export async function getAuditLogById(req: ContextRequest, res: Response): Promise<any> {
  const item = await prisma.auditLog.findFirst({ where: { id: String(req.params.id), institutionId: req.context?.institutionId || '' } });
  if (!item) return res.status(404).json({ error: 'سجل التدقيق غير موجود.' });
  return res.json({ ...item, metadata: safeAuditMetadata(item.metadata) });
}
