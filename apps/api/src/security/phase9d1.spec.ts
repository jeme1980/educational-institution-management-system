import assert from 'node:assert/strict';
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
  const suffix = Date.now().toString().slice(-8);
  const plan = await platformPrisma.plan.create({ data: { code: `10C6C_${suffix}`, nameAr: 'Phase 10C-6C fixture plan', maxStudents: 100, isActive: true } });
  const schoolUser = await platformPrisma.user.findFirstOrThrow({ where: { institutionUsers: { some: {} } } });
  const actor = await platformPrisma.user.create({ data: { email: `phase9d1-${suffix}@example.com`, normalizedEmail: `phase9d1-${suffix}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
  let institutionId = '';
  let provisioned: any;
  try {
    const runtimePlan = await platformRuntimePrisma.plan.findUnique({ where: { id: plan.id }, select: { id: true, isActive: true } });
    assert.equal(runtimePlan?.isActive, true, 'Platform runtime must see the isolated fixture plan');
    const allowed = await invoke((req: any, res: any) => requirePlatformAdmin(req, res, () => res.json({ allowed: true })), { user: { uid: actor.id } });
    assert.equal(allowed.body.allowed, true);
    const denied = await invoke((req: any, res: any) => requirePlatformAdmin(req, res, () => res.json({ allowed: true })), { user: { uid: schoolUser.id } });
    assert.equal(denied.statusCode, 403);

    const request = { user: { uid: actor.id }, body: { schoolCode: `E2E_${suffix}`, slug: `e2e-${suffix}`, nameAr: 'مؤسسة اختبار المنصة', nameHe: 'מוסד בדיקה', email: `school-${suffix}@example.com`, typeId: base.typeId, regionId: base.regionId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId }, params: {}, query: {} };
    const created = await invoke(createInstitution, request);
    assert.equal(created.statusCode, 201);
    institutionId = created.body.institution.id;
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
    provisioned = await provisionInitialSchoolAdmin({ institutionId, email: `admin-${suffix}@example.com`, firstNameAr: 'مدير', familyNameAr: 'الاختبار', actorUserId: actor.id });
    assert.ok(provisioned.institutionUserId);
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
    await platformPrisma.user.delete({ where: { id: actor.id } });
    await platformPrisma.plan.delete({ where: { id: plan.id } }).catch(() => undefined);
  }
});
