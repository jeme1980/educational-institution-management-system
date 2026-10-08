import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { testAdminPrisma as platformPrisma } from '../db/test-admin-prisma';
import { platformPrisma as platformRuntimePrisma } from '../db/platform-prisma';
import { createInstitution, listInstitutions } from '../controllers/platform.controller';
import { requirePlatformAdmin } from '../middleware/platform-auth.middleware';
import { hashPassword } from './password';
import { assignPlatformSubscription } from '../services/platform-subscription.service';
import { provisionInitialSchoolAdmin } from '../services/school-onboarding.service';

const invoke = async (handler: any, req: any) => {
  let statusCode = 200; let body: any;
  const res: any = { getHeader: () => undefined, setHeader: () => res, status: (code: number) => { statusCode = code; return res; }, json: (value: any) => { body = value; return res; } };
  await handler(req, res);
  return { statusCode, body };
};

test('Phase 9D-1: platform institution creation flow', async () => {
  const base = await platformPrisma.institution.findFirstOrThrow();
  const schoolUser = await platformPrisma.user.findFirstOrThrow({ where: { institutionUsers: { some: {} } } });
  const nonce = randomUUID().replaceAll('-', '');
  const adminEmail = `phase9d1-admin-${nonce}@example.com`;
  let planId = '';
  let actorId = '';
  let institutionId = '';
  let provisioned: any;
  try {
    const plan = await platformPrisma.plan.create({ data: { code: `10C6C_${nonce}`, nameAr: 'Phase 10C-6C fixture plan', maxStudents: 100, isActive: true } });
    planId = plan.id;
    const actor = await platformPrisma.user.create({ data: { email: `phase9d1-${nonce}@example.com`, normalizedEmail: `phase9d1-${nonce}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
    actorId = actor.id;
    const runtimePlan = await platformRuntimePrisma.plan.findUnique({ where: { id: plan.id }, select: { id: true, isActive: true } });
    assert.equal(runtimePlan?.isActive, true, 'Platform runtime must see the isolated fixture plan');
    const allowed = await invoke((req: any, res: any) => requirePlatformAdmin(req, res, () => res.json({ allowed: true })), { user: { uid: actor.id } });
    assert.equal(allowed.body.allowed, true);
    const denied = await invoke((req: any, res: any) => requirePlatformAdmin(req, res, () => res.json({ allowed: true })), { user: { uid: schoolUser.id } });
    assert.equal(denied.statusCode, 403);

    const request = { user: { uid: actor.id }, body: { schoolCode: `E2E_${nonce.slice(0, 16)}`, slug: `e2e-${nonce}`, nameAr: 'مؤسسة اختبار المنصة', nameHe: 'מוסד בדיקה', email: `school-${nonce}@example.com`, typeId: base.typeId, regionId: base.regionId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId }, params: {}, query: {} };
    const created = await invoke(createInstitution, request);
    institutionId = created.body?.institution?.id || '';
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.subscription, null);

    const counts = await Promise.all([
      platformPrisma.student.count({ where: { institutionId } }),
      platformPrisma.staffMember.count({ where: { institutionId } }),
      platformPrisma.institutionUser.count({ where: { institutionId } }),
      platformPrisma.academicYear.count({ where: { institutionId } }),
      platformPrisma.institutionSubscription.count({ where: { institutionId } }),
    ]);
    assert.deepEqual(counts, [0, 0, 0, 0, 0]);

    const listed = await invoke(listInstitutions, { user: { uid: actor.id }, body: {}, params: {}, query: {} });
    const row = listed.body.find((item: any) => item.id === institutionId);
    assert.ok(row);
    assert.equal(row.initialAdmin.status, 'NOT_PROVISIONED');
    assert.equal(row.subscription, null);

    assert.equal((await invoke(createInstitution, request)).statusCode, 409);
    assert.equal((await invoke(createInstitution, { ...request, body: { nameAr: '' } })).statusCode, 400);

    await assignPlatformSubscription({ institutionId, planId: plan.id, actorUserId: actor.id });
    provisioned = await provisionInitialSchoolAdmin({ institutionId, email: adminEmail, firstNameAr: 'مدير', familyNameAr: 'الاختبار', actorUserId: actor.id });
    assert.ok(provisioned.institutionUserId);
    assert.equal((await platformPrisma.user.findUniqueOrThrow({ where: { id: provisioned.userId } })).normalizedEmail, adminEmail);
  } finally {
    if (institutionId) {
      await platformPrisma.platformAuditLog.deleteMany({ where: { targetInstitutionId: institutionId } });
      if (provisioned) {
        await platformPrisma.userAccountSetupToken.deleteMany({ where: { userId: provisioned.userId } });
        await platformPrisma.institutionUserRole.deleteMany({ where: { institutionUserId: provisioned.institutionUserId } });
        await platformPrisma.rolePermission.deleteMany({ where: { institutionId } });
        await platformPrisma.institutionUser.delete({ where: { id: provisioned.institutionUserId } });
        await platformPrisma.staffMember.delete({ where: { id: provisioned.staffMemberId } });
        await platformPrisma.role.deleteMany({ where: { institutionId } });
        await platformPrisma.user.delete({ where: { id: provisioned.userId } });
      }
      await platformPrisma.institutionSubscription.deleteMany({ where: { institutionId } });
      await platformPrisma.institution.delete({ where: { id: institutionId } });
    }
    if (actorId) await platformPrisma.user.delete({ where: { id: actorId } });
    if (planId) await platformPrisma.plan.delete({ where: { id: planId } });
  }
});
