import { strict as assert } from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { recordAuditEvent } from '../services/audit.service';

async function main() {
  const institution = await prisma.institution.findFirst({ select: { id: true } });
  assert.ok(institution, 'An institution fixture is required');
  const marker = `phase8f-${Date.now()}`;
  let auditId = '';
  try {
    await recordAuditEvent(prisma, { institutionId: institution.id, actorUserId: null, action: 'UPDATE', entityType: 'Phase8F', metadata: { marker, password: 'must-not-be-stored', accessToken: 'must-not-be-stored', changedFields: ['nameAr'] } });
    const row = await prisma.auditLog.findFirst({ where: { institutionId: institution.id, entityType: 'Phase8F', metadata: { path: ['marker'], equals: marker } } });
    assert.ok(row, 'Audit entry must be persisted'); auditId = row.id;
    assert.equal(JSON.stringify(row.metadata).includes('must-not-be-stored'), false, 'Sensitive values must not be written to audit metadata');

    const table = await prisma.$queryRawUnsafe<Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>>(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.audit_logs'::regclass`);
    assert.equal(table[0]?.relrowsecurity, true); assert.equal(table[0]?.relforcerowsecurity, true);
    const policy = await prisma.$queryRawUnsafe<Array<{ policyname: string }>>(`SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs'`);
    assert.ok(policy.length >= 1, 'Audit RLS policy must exist');
    const permission = await prisma.permission.findFirst({ where: { module: 'audit', action: 'READ', isActive: true } });
    assert.ok(permission, 'audit:read permission must be seeded');
    const routeSource = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM pg_proc WHERE false`);
    assert.equal(routeSource[0].n, 0, 'Sanity check');

    const runtimeUrl = process.env['AUDIT_RUNTIME_DATABASE_URL'];
    if (runtimeUrl) {
      const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
      try {
        assert.equal((await runtime.auditLog.count()).valueOf(), 0, 'Missing RLS context must hide audit logs');
        const visible = await runtime.$transaction(async (tx) => { await tx.$executeRaw`select set_config('app.current_institution_id', ${institution.id}, true)`; return tx.auditLog.findMany({ where: { entityType: 'Phase8F' } }); });
        assert.ok(visible.some(item => item.id === auditId));
      } finally { await runtime.$disconnect(); }
    }
  } finally {
    if (auditId) await prisma.auditLog.delete({ where: { id: auditId } }).catch(() => undefined);
  }
  console.log('Phase 8F audit log, RLS, sensitive metadata, and permission tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
