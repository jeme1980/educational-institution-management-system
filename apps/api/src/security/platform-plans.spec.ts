import assert from 'node:assert/strict';
import test from 'node:test';
import { updatePlan } from '../controllers/platform.controller';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';

const invoke = async (handler: any, req: any) => {
  let statusCode = 200;
  let body: any;
  const res: any = { status: (code: number) => { statusCode = code; return res; }, json: (value: any) => { body = value; return res; } };
  await handler(req, res);
  return { statusCode, body };
};

test('Platform plan updates validate fields, preserve code, enforce usage safety, and audit changes', async () => {
  const actor = await admin.user.findFirstOrThrow({ where: { isPlatformAdmin: true } });
  const type = await admin.educationType.findFirstOrThrow();
  const region = await admin.region.findFirstOrThrow();
  const status = await admin.institutionStatus.findFirstOrThrow();
  const language = await admin.language.findFirstOrThrow();
  const suffix = Date.now().toString().slice(-8);
  const institution = await admin.institution.create({ data: { schoolCode: `PL${suffix}`, slug: `plan-edit-${suffix}`, nameAr: 'Plan edit test institution', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const studentUsage = await admin.student.count({ where: { institutionId: institution.id, isActive: true } });
  const plan = await admin.plan.create({ data: { code: `EDIT_${suffix}`, nameAr: 'Plan edit test', maxStudents: Math.max(studentUsage + 1, 1) } });
  const subscription = await admin.institutionSubscription.create({ data: { institutionId: institution.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() } });
  const request = { user: { uid: actor.id }, params: { id: plan.id }, query: {} };
  try {
    const invalid = await invoke(updatePlan, { ...request, body: { maxStudents: -1 } });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.code, 'VALIDATION_ERROR');

    const immutable = await invoke(updatePlan, { ...request, body: { code: 'CHANGED' } });
    assert.equal(immutable.statusCode, 400);
    assert.equal(immutable.body.code, 'IMMUTABLE_FIELD');

    const belowUsage = await invoke(updatePlan, { ...request, body: { maxStudents: Math.max(studentUsage - 1, 0) } });
    if (studentUsage > 0) {
      assert.equal(belowUsage.statusCode, 409);
      assert.equal(belowUsage.body.code, 'PLAN_LIMIT_BELOW_USAGE');
      assert.equal(belowUsage.body.currentUsage, studentUsage);
    }

    const updated = await invoke(updatePlan, { ...request, body: { nameAr: 'Plan edit updated', maxStudents: studentUsage + 2 } });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.nameAr, 'Plan edit updated');
    assert.equal(updated.body.maxStudents, studentUsage + 2);
    const audit = await admin.platformAuditLog.findFirst({ where: { action: 'PLAN_UPDATED', entityId: plan.id, actorUserId: actor.id } });
    assert.ok(audit);
  } finally {
    await admin.platformAuditLog.deleteMany({ where: { entityId: plan.id } });
    await admin.institutionSubscription.delete({ where: { id: subscription.id } });
    await admin.plan.delete({ where: { id: plan.id } });
    await admin.institution.delete({ where: { id: institution.id } });
  }
});
