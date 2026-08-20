import assert from 'node:assert/strict';
import test from 'node:test';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { getInstitutionSubscriptionState, checkPlanLimit } from '../services/subscription.service';
import { withRlsContext } from '../middleware/rls-request.middleware';

test('Phase 9A: subscription isolation, lifecycle and limits', async () => {
  const base = await prisma.institution.findFirstOrThrow();
  const suffix = Date.now().toString().slice(-8);
  const [institutionA, institutionB] = await Promise.all([
    prisma.institution.create({ data: { schoolCode: `9A${suffix}A`, slug: `phase-9a-${suffix}-a`, nameAr: 'Phase 9A A', typeId: base.typeId, regionId: base.regionId, townId: base.townId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId } }),
    prisma.institution.create({ data: { schoolCode: `9A${suffix}B`, slug: `phase-9a-${suffix}-b`, nameAr: 'Phase 9A B', typeId: base.typeId, regionId: base.regionId, townId: base.townId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId } }),
  ]);
  const plan = await prisma.plan.create({ data: { code: `PHASE9A_${suffix}`, nameAr: 'Phase 9A test', maxStudents: 2 } });
  const now = new Date();
  const [subscriptionA, subscriptionB] = await Promise.all([
    prisma.institutionSubscription.create({ data: { institutionId: institutionA.id, planId: plan.id, status: 'ACTIVE', startsAt: now } }),
    prisma.institutionSubscription.create({ data: { institutionId: institutionB.id, planId: plan.id, status: 'SUSPENDED', startsAt: now } }),
  ]);
  try {
    const own = await withRlsContext(institutionA.id, () => getInstitutionSubscriptionState(institutionA.id));
    assert.equal(own.subscription?.institutionId, institutionA.id);
    assert.equal(own.status, 'ACTIVE');
    assert.equal(own.plan?.code, plan.code);
    const other = await withRlsContext(institutionB.id, () => getInstitutionSubscriptionState(institutionB.id));
    assert.equal(other.subscription?.institutionId, institutionB.id);
    assert.equal(other.status, 'SUSPENDED');
    assert.notEqual(own.subscription?.id, other.subscription?.id);
    await prisma.institutionSubscription.update({ where: { id: subscriptionA.id }, data: { endsAt: new Date(Date.now() - 60_000) } });
    const expired = await withRlsContext(institutionA.id, () => getInstitutionSubscriptionState(institutionA.id));
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(expired.isActive, false);
    await prisma.institutionSubscription.update({ where: { id: subscriptionA.id }, data: { endsAt: null, status: 'ACTIVE' } });
    const request = { context: { institutionId: institutionA.id, academicYearId: '' } } as any;
    let responseCode = 0; let responseBody: any;
    const response = { status: (code: number) => { responseCode = code; return { json: (body: any) => { responseBody = body; } }; } } as any;
    await prisma.plan.update({ where: { id: plan.id }, data: { maxStudents: 0 } });
    await withRlsContext(institutionA.id, () => checkPlanLimit('students')(request, response, () => undefined));
    assert.equal(responseCode, 403);
    assert.equal((responseBody as any).code, 'PLAN_LIMIT_REACHED');
    await prisma.plan.update({ where: { id: plan.id }, data: { maxStudents: 2 } });
    responseCode = 0; responseBody = undefined;
    await withRlsContext(institutionA.id, () => checkPlanLimit('students')(request, response, () => undefined));
    assert.equal(responseCode, 0);
    assert.equal(responseBody, undefined);
    await prisma.institutionSubscription.update({ where: { id: subscriptionA.id }, data: { status: 'SUSPENDED' } });
    await withRlsContext(institutionA.id, () => checkPlanLimit('students')(request, response, () => undefined));
    assert.equal(responseCode, 403);
    assert.ok(responseBody);
    assert.equal((responseBody as any).code, 'SUBSCRIPTION_INACTIVE');
  } finally {
    await prisma.institutionSubscription.deleteMany({ where: { id: { in: [subscriptionA.id, subscriptionB.id] } } });
    await prisma.plan.delete({ where: { id: plan.id } });
    await prisma.institution.deleteMany({ where: { id: { in: [institutionA.id, institutionB.id] } } });
  }
});
