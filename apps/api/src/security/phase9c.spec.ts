import assert from 'node:assert/strict';
import test from 'node:test';
import { testAdminPrisma as platformPrisma } from '../db/test-admin-prisma';
import { hashPassword } from '../security/password';
import { requirePlatformAdmin } from '../middleware/platform-auth.middleware';
import { provisionInitialSchoolAdmin, reissueInitialAdminSetup } from '../services/school-onboarding.service';
import { completeAccountSetup } from '../controllers/account-setup.controller';
import { createAuthLogin } from '../controllers/auth.controller';

const invoke = async (handler: any, body: any) => {
  let statusCode = 0; let responseBody: any;
  const headers = new Map<string, unknown>();
  const response: any = { getHeader: (name: string) => headers.get(name), setHeader: (name: string, value: unknown) => { headers.set(name, value); return response; }, status: (code: number) => { statusCode = code; return response; }, json: (value: any) => { responseBody = value; return response; } };
  await handler({ body, headers: {}, ip: '127.0.0.1' } as any, response);
  return { statusCode, body: responseBody };
};

const tokenFromSetupUrl = (url: string) => decodeURIComponent(new URL(url).searchParams.get('token') || '');

test('Phase 9C: initial administrator provisioning and secure account setup', async () => {
  const base = await platformPrisma.institution.findFirstOrThrow();
  const plan = await platformPrisma.plan.findFirstOrThrow({ where: { isActive: true } });
  const suffix = Date.now().toString().slice(-8);
  const institution = await platformPrisma.institution.create({ data: { schoolCode: `9C${suffix}`, slug: `phase-9c-${suffix}`, nameAr: 'Phase 9C institution', typeId: base.typeId, regionId: base.regionId, townId: base.townId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId } });
  await platformPrisma.institutionSubscription.create({ data: { institutionId: institution.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() } });
  const actor = await platformPrisma.user.create({ data: { email: `phase9c-actor-${suffix}@example.com`, normalizedEmail: `phase9c-actor-${suffix}@example.com`, passwordHash: await hashPassword('Platform@2026!'), isPlatformAdmin: true } });
  let provisioned: any;
  try {
    assert.equal((await (async () => { let next = false; await requirePlatformAdmin({ user: { uid: actor.id } } as any, { status: () => ({ json: () => undefined }) } as any, () => { next = true; }); return next; })()), true);
    provisioned = await provisionInitialSchoolAdmin({ institutionId: institution.id, email: `admin-${suffix}@example.com`, firstNameAr: 'مدير', familyNameAr: 'التجربة', actorUserId: actor.id });
    assert.ok(provisioned.setup.setupUrl);
    const detail = await platformPrisma.institutionUser.findUnique({ where: { id: provisioned.institutionUserId }, include: { user: true, roles: { include: { role: true } } } });
    assert.equal(detail?.user.mustChangePassword, true);
    assert.equal(detail?.roles[0]?.role.isSystem, true);

    const oldToken = tokenFromSetupUrl(provisioned.setup.setupUrl!);
    const reissued = await reissueInitialAdminSetup({ institutionId: institution.id, actorUserId: actor.id });
    assert.ok(reissued.setup.setupUrl);
    assert.notEqual(oldToken, tokenFromSetupUrl(reissued.setup.setupUrl!));
    assert.equal((await invoke(completeAccountSetup, { token: oldToken, password: 'School@2026!', confirmPassword: 'School@2026!' })).statusCode, 400);
    assert.equal((await invoke(completeAccountSetup, { token: tokenFromSetupUrl(reissued.setup.setupUrl!), password: 'School@2026!', confirmPassword: 'School@2026!' })).statusCode, 0);

    const login = await invoke(createAuthLogin, { email: `admin-${suffix}@example.com`, password: 'School@2026!' });
    assert.equal(login.statusCode, 0);
    assert.equal(login.body.context.institutionId, institution.id);
    assert.equal(login.body.context.isPlatformAdmin, undefined);

    const duplicate = await provisionInitialSchoolAdmin({ institutionId: institution.id, email: `another-${suffix}@example.com`, firstNameAr: 'مكرر', familyNameAr: 'مكرر', actorUserId: actor.id }).catch((error) => error);
    assert.equal(duplicate.statusCode, 409);
  } finally {
    await platformPrisma.userSession.deleteMany({ where: { userId: { in: [actor.id, provisioned?.userId].filter(Boolean) } } });
    await platformPrisma.platformAuditLog.deleteMany({ where: { targetInstitutionId: institution.id } });
    await platformPrisma.auditLog.deleteMany({ where: { institutionId: institution.id } });
    await platformPrisma.userAccountSetupToken.deleteMany({ where: { userId: provisioned?.userId || undefined } });
    if (provisioned) {
      await platformPrisma.institutionUserRole.deleteMany({ where: { institutionUserId: provisioned.institutionUserId } });
      const roles = await platformPrisma.role.findMany({ where: { institutionId: institution.id } });
      await platformPrisma.rolePermission.deleteMany({ where: { institutionId: institution.id } });
      await platformPrisma.institutionUser.delete({ where: { id: provisioned.institutionUserId } });
      await platformPrisma.staffMember.delete({ where: { id: provisioned.staffMemberId } });
      await platformPrisma.role.deleteMany({ where: { id: { in: roles.map((role) => role.id) } } });
      await platformPrisma.user.delete({ where: { id: provisioned.userId } });
    }
    await platformPrisma.institutionSubscription.deleteMany({ where: { institutionId: institution.id } });
    await platformPrisma.institution.delete({ where: { id: institution.id } });
    await platformPrisma.user.delete({ where: { id: actor.id } });
  }
});
