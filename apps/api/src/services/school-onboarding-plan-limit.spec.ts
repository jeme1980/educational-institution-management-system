import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { platformPrisma } from '../db/platform-prisma';
import { prisma } from '../db/prisma';
import { withPlatformInstitutionContext } from '../db/platform-institution-context';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { assignSubscription, provisionInitialAdmin, updatePlan } from '../controllers/platform.controller';
import { lockPlatformInstitution, lockPlatformPlan } from './platform-plan-coordination.service';
import { assignPlatformSubscriptionInTransaction } from './platform-subscription.service';
import { checkPlanLimit, type SubscriptionResource } from './subscription.service';
import { provisionInitialSchoolAdmin, provisionInitialSchoolAdminInTransaction, reissueInitialAdminSetup } from './school-onboarding.service';

after(async () => { await Promise.all([admin.$disconnect(), platformPrisma.$disconnect(), prisma.$disconnect()]); });

function gate() {
  let release!: () => void;
  return { promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
}

async function invoke(handler: (req: any, res: any) => Promise<void>, req: any) {
  let status = 200; let body: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } };
  await handler(req, res);
  return { status, body };
}

async function schoolAttempt(institutionId: string, resource: SubscriptionResource, write: () => Promise<unknown>, locked?: ReturnType<typeof gate>, release?: ReturnType<typeof gate>) {
  return withRlsContext(institutionId, async () => {
    let status = 0; let body: any; let passed = false;
    const res: any = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } };
    await checkPlanLimit(resource)({ context: { institutionId, academicYearId: '' } } as any, res, () => { passed = true; });
    if (!passed) return { status, body };
    locked?.release();
    if (release) await release.promise;
    await write();
    return { status: 201, body: null };
  });
}

async function fixture(maxStaff: number | null, maxUsers: number | null) {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const base = await admin.institution.findFirstOrThrow();
  const institution = await admin.institution.create({ data: {
    schoolCode: `OA_${suffix}`, slug: `onboarding-audit-${suffix}`, nameAr: 'Onboarding limit fixture',
    typeId: base.typeId, regionId: base.regionId, townId: base.townId,
    statusId: base.statusId, defaultLanguageId: base.defaultLanguageId,
  } });
  const plan = await admin.plan.create({ data: { code: `OA_${suffix}`, nameAr: 'Onboarding plan', maxStaff, maxUsers } });
  await admin.institutionSubscription.create({ data: { institutionId: institution.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() } });
  const email = `onboarding-${suffix}@example.test`;
  const input = { institutionId: institution.id, email, firstNameAr: 'مدير', familyNameAr: 'اختبار' };
  const extraUserIds: string[] = [];
  async function createSchoolUser(index = 0) {
    const schoolEmail = `school-${suffix}-${index}@example.test`;
    const user = await admin.user.create({ data: { email: schoolEmail, normalizedEmail: schoolEmail, passwordHash: 'fixture' } });
    extraUserIds.push(user.id);
    const staff = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'School', familyNameAr: 'Fixture' } });
    return { userId: user.id, staffId: staff.id };
  }
  async function counts() {
    return {
      staff: await admin.staffMember.count({ where: { institutionId: institution.id, archivedAt: null } }),
      users: await admin.institutionUser.count({ where: { institutionId: institution.id, isActive: true, archivedAt: null } }),
      tokens: await admin.userAccountSetupToken.count({ where: { user: { normalizedEmail: email } } }),
      audit: await admin.platformAuditLog.count({ where: { targetInstitutionId: institution.id, action: 'INITIAL_ADMIN_PROVISIONED' } }),
    };
  }
  async function cleanup() {
    const members = await admin.institutionUser.findMany({ where: { institutionId: institution.id }, select: { userId: true } });
    const userIds = members.map(({ userId }) => userId);
    await admin.userAccountSetupToken.deleteMany({ where: { userId: { in: userIds } } });
    await admin.institutionUserRole.deleteMany({ where: { institutionId: institution.id } });
    await admin.rolePermission.deleteMany({ where: { institutionId: institution.id } });
    await admin.institutionUser.deleteMany({ where: { institutionId: institution.id } });
    await admin.staffMember.deleteMany({ where: { institutionId: institution.id } });
    await admin.role.deleteMany({ where: { institutionId: institution.id } });
    await admin.platformAuditLog.deleteMany({ where: { targetInstitutionId: institution.id } });
    const allUserIds = [...new Set([...userIds, ...extraUserIds])];
    if (allUserIds.length) await admin.user.deleteMany({ where: { id: { in: allUserIds } } });
    await admin.institutionSubscription.deleteMany({ where: { institutionId: institution.id } });
    await admin.plan.delete({ where: { id: plan.id } });
    await admin.institution.delete({ where: { id: institution.id } });
  }
  return { institution, plan, input, counts, cleanup, createSchoolUser };
}

function belowUsage(field: 'maxStaff' | 'maxUsers', currentUsage: number) {
  return (error: any) => error?.statusCode === 409 && error?.code === 'PLAN_LIMIT_BELOW_USAGE'
    && error?.field === field && error?.currentUsage === currentUsage;
}

async function assertNoAdminAccount(input: { email: string }) {
  assert.equal(await admin.user.count({ where: { normalizedEmail: input.email } }), 0);
}

test('initial admin cannot consume a staff seat when maxStaff is zero', async () => {
  const f = await fixture(0, null);
  try {
    await assert.rejects(provisionInitialSchoolAdmin(f.input), belowUsage('maxStaff', 1));
    assert.deepEqual(await f.counts(), { staff: 0, users: 0, tokens: 0, audit: 0 });
    await assertNoAdminAccount(f.input);
  } finally { await f.cleanup(); }
});

test('initial admin cannot consume a user seat when maxUsers is zero', async () => {
  const f = await fixture(null, 0);
  try {
    await assert.rejects(provisionInitialSchoolAdmin(f.input), belowUsage('maxUsers', 1));
    assert.deepEqual(await f.counts(), { staff: 0, users: 0, tokens: 0, audit: 0 });
    await assertNoAdminAccount(f.input);
  } finally { await f.cleanup(); }
});

test('Platform initial-admin controller returns the established 409 payload', async () => {
  const f = await fixture(0, null);
  try {
    const result = await invoke(provisionInitialAdmin, { params: { id: f.institution.id }, body: f.input });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
    assert.equal(result.body.field, 'maxStaff');
    assert.equal(result.body.currentUsage, 1);
    assert.deepEqual(await f.counts(), { staff: 0, users: 0, tokens: 0, audit: 0 });
    await assertNoAdminAccount(f.input);
  } finally { await f.cleanup(); }
});

test('initial admin succeeds at one seat and reissue does not consume another seat', async () => {
  const f = await fixture(1, 1);
  try {
    await provisionInitialSchoolAdmin(f.input);
    assert.deepEqual(await f.counts(), { staff: 1, users: 1, tokens: 1, audit: 1 });
    await reissueInitialAdminSetup({ institutionId: f.institution.id });
    assert.equal((await f.counts()).staff, 1);
    assert.equal((await f.counts()).users, 1);
  } finally { await f.cleanup(); }
});

test('initial admin remains allowed when both limits are unlimited', async () => {
  const f = await fixture(null, null);
  try {
    await provisionInitialSchoolAdmin(f.input);
    assert.equal((await f.counts()).staff, 1);
    assert.equal((await f.counts()).users, 1);
  } finally { await f.cleanup(); }
});

test('projected staff and user usage rejects a new seat when existing usage equals the limit', async () => {
  const staff = await fixture(2, null);
  const users = await fixture(null, 2);
  try {
    await admin.staffMember.createMany({ data: [0, 1].map((index) => ({ institutionId: staff.institution.id, firstNameAr: `Staff ${index}`, familyNameAr: 'Fixture' })) });
    await assert.rejects(provisionInitialSchoolAdmin(staff.input), belowUsage('maxStaff', 3));
    assert.deepEqual(await staff.counts(), { staff: 2, users: 0, tokens: 0, audit: 0 });
    for (let index = 0; index < 2; index += 1) {
      const account = await users.createSchoolUser(index);
      await admin.institutionUser.create({ data: { institutionId: users.institution.id, userId: account.userId, staffMemberId: account.staffId } });
    }
    await assert.rejects(provisionInitialSchoolAdmin(users.input), belowUsage('maxUsers', 3));
    assert.deepEqual(await users.counts(), { staff: 2, users: 2, tokens: 0, audit: 0 });
  } finally { await users.cleanup(); await staff.cleanup(); }
});

for (const resource of ['staff', 'users'] as const) {
  test(`${resource}: School write wins over initial-admin provisioning`, async () => {
    const f = await fixture(resource === 'staff' ? 1 : null, resource === 'users' ? 1 : null);
    const entered = gate(); const release = gate();
    try {
      const account = resource === 'users' ? await f.createSchoolUser() : null;
      const school = schoolAttempt(f.institution.id, resource, () => resource === 'staff'
        ? prisma.staffMember.create({ data: { institutionId: f.institution.id, firstNameAr: 'School', familyNameAr: 'Winner' } })
        : prisma.institutionUser.create({ data: { institutionId: f.institution.id, userId: account!.userId, staffMemberId: account!.staffId } }), entered, release);
      await entered.promise;
      const onboarding = provisionInitialSchoolAdmin(f.input);
      release.release();
      assert.equal((await school).status, 201);
      await assert.rejects(onboarding, belowUsage(resource === 'staff' ? 'maxStaff' : 'maxUsers', 2));
      const usage = await f.counts();
      assert.equal(usage[resource], 1);
      assert.equal(usage.tokens, 0);
      assert.equal(usage.audit, 0);
    } finally { release.release(); await f.cleanup(); }
  });

  test(`${resource}: initial-admin provisioning wins over School write`, async () => {
    const f = await fixture(resource === 'staff' ? 1 : null, resource === 'users' ? 1 : null);
    const locked = gate(); const release = gate();
    try {
      const account = resource === 'users' ? await f.createSchoolUser() : null;
      const onboarding = withPlatformInstitutionContext(f.institution.id, async (tx) => {
        assert.equal(await lockPlatformInstitution(tx, f.institution.id), true);
        locked.release();
        await release.promise;
        return provisionInitialSchoolAdminInTransaction(tx, f.input);
      });
      await locked.promise;
      const school = schoolAttempt(f.institution.id, resource, () => resource === 'staff'
        ? prisma.staffMember.create({ data: { institutionId: f.institution.id, firstNameAr: 'School', familyNameAr: 'Loser' } })
        : prisma.institutionUser.create({ data: { institutionId: f.institution.id, userId: account!.userId, staffMemberId: account!.staffId } }));
      release.release();
      await onboarding;
      const result = await school;
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'PLAN_LIMIT_REACHED');
      const usage = await f.counts();
      assert.equal(usage[resource], 1);
      assert.equal(usage.tokens, 1);
    } finally { release.release(); await f.cleanup(); }
  });
}

test('onboarding wins over Plan lowering and the lowering rechecks its new usage', async () => {
  const f = await fixture(1, 1);
  const locked = gate(); const release = gate();
  try {
    const onboarding = withPlatformInstitutionContext(f.institution.id, async (tx) => {
      assert.equal(await lockPlatformInstitution(tx, f.institution.id), true);
      locked.release();
      await release.promise;
      return provisionInitialSchoolAdminInTransaction(tx, f.input);
    });
    await locked.promise;
    const lowering = invoke(updatePlan, { params: { id: f.plan.id }, body: { maxStaff: 0, maxUsers: 0 } });
    release.release();
    await onboarding;
    const result = await lowering;
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
    assert.equal((await f.counts()).staff, 1);
    assert.equal((await admin.plan.findUniqueOrThrow({ where: { id: f.plan.id } })).maxStaff, 1);
  } finally { release.release(); await f.cleanup(); }
});

test('Plan lowering wins and onboarding reads the tightened Plan after its wait', async () => {
  const f = await fixture(1, 1);
  const locked = gate(); const release = gate();
  try {
    const lowering = platformPrisma.$transaction(async (tx) => {
      assert.equal(await lockPlatformPlan(tx, f.plan.id), true);
      assert.equal(await lockPlatformInstitution(tx, f.institution.id), true);
      locked.release();
      await release.promise;
      await tx.plan.update({ where: { id: f.plan.id }, data: { maxStaff: 0 } });
    });
    await locked.promise;
    const onboarding = provisionInitialSchoolAdmin(f.input);
    release.release();
    await lowering;
    await assert.rejects(onboarding, belowUsage('maxStaff', 1));
    assert.deepEqual(await f.counts(), { staff: 0, users: 0, tokens: 0, audit: 0 });
  } finally { release.release(); await f.cleanup(); }
});

test('onboarding wins over strict target-Plan reassignment', async () => {
  const f = await fixture(1, 1);
  const target = await admin.plan.create({ data: { code: `${f.plan.code}_T`, nameAr: 'Strict target', maxStaff: 0, maxUsers: 1 } });
  const locked = gate(); const release = gate();
  try {
    const onboarding = withPlatformInstitutionContext(f.institution.id, async (tx) => {
      assert.equal(await lockPlatformInstitution(tx, f.institution.id), true);
      locked.release();
      await release.promise;
      return provisionInitialSchoolAdminInTransaction(tx, f.input);
    });
    await locked.promise;
    const reassignment = invoke(assignSubscription, { params: { id: f.institution.id }, body: { planId: target.id } });
    release.release();
    await onboarding;
    const result = await reassignment;
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
    assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: f.institution.id, status: 'ACTIVE' } })).planId, f.plan.id);
  } finally { release.release(); await f.cleanup(); await admin.plan.delete({ where: { id: target.id } }); }
});

test('strict target-Plan reassignment wins and onboarding rejects the new limit', async () => {
  const f = await fixture(1, 1);
  const target = await admin.plan.create({ data: { code: `${f.plan.code}_T`, nameAr: 'Strict target', maxStaff: 0, maxUsers: 1 } });
  const locked = gate(); const release = gate();
  try {
    const reassignment = platformPrisma.$transaction(async (tx) => {
      assert.equal(await lockPlatformPlan(tx, target.id), true);
      assert.equal(await lockPlatformInstitution(tx, f.institution.id), true);
      locked.release();
      await release.promise;
      await assignPlatformSubscriptionInTransaction(tx, { institutionId: f.institution.id, planId: target.id });
    });
    await locked.promise;
    const onboarding = provisionInitialSchoolAdmin(f.input);
    release.release();
    await reassignment;
    await assert.rejects(onboarding, belowUsage('maxStaff', 1));
    assert.deepEqual(await f.counts(), { staff: 0, users: 0, tokens: 0, audit: 0 });
    assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: f.institution.id, status: 'ACTIVE' } })).planId, target.id);
  } finally { release.release(); await f.cleanup(); await admin.plan.delete({ where: { id: target.id } }); }
});

test('an unrelated institution can provision while another institution row is locked', async () => {
  const a = await fixture(1, 1);
  const b = await fixture(1, 1);
  const locked = gate(); const release = gate();
  try {
    const holding = platformPrisma.$transaction(async (tx) => {
      assert.equal(await lockPlatformInstitution(tx, a.institution.id), true);
      locked.release();
      await release.promise;
    });
    await locked.promise;
    await provisionInitialSchoolAdmin(b.input);
    assert.equal((await b.counts()).users, 1);
    release.release();
    await holding;
  } finally { release.release(); await b.cleanup(); await a.cleanup(); }
});
