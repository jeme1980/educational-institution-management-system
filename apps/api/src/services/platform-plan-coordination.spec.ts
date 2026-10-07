import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { platformPrisma } from '../db/platform-prisma';
import { prisma } from '../db/prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { assignSubscription, renewSubscription, transitionSubscription, updatePlan } from '../controllers/platform.controller';
import { checkPlanLimit, type SubscriptionResource } from './subscription.service';
import { lockPlatformInstitution, lockPlatformPlan } from './platform-plan-coordination.service';
import { assignPlatformSubscriptionInTransaction } from './platform-subscription.service';

after(async () => { await Promise.all([admin.$disconnect(), platformPrisma.$disconnect(), prisma.$disconnect()]); });

function gate() {
  let release!: () => void;
  return { promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
}

async function invoke(handler: (req: any, res: any) => Promise<void>, req: any) {
  let status = 200;
  let body: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } };
  await handler(req, res);
  return { status, body };
}

async function createFixture(resource: SubscriptionResource) {
  const base = await admin.institution.findFirstOrThrow();
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const institution = await admin.institution.create({ data: { schoolCode: `PC${suffix}`.slice(0, 20), slug: `plan-coordination-${suffix}`, nameAr: 'Plan coordination fixture', typeId: base.typeId, regionId: base.regionId, townId: base.townId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId } });
  const limitField: 'maxStudents' | 'maxStaff' | 'maxUsers' = resource === 'students' ? 'maxStudents' : resource === 'staff' ? 'maxStaff' : 'maxUsers';
  const plan = await admin.plan.create({ data: { code: `PC_${suffix}`, nameAr: 'Current plan', [limitField]: 2 } });
  const target = await admin.plan.create({ data: { code: `PT_${suffix}`, nameAr: 'Target plan', [limitField]: 1 } });
  await admin.institutionSubscription.create({ data: { institutionId: institution.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() } });
  const studentStatus = resource === 'students' ? await admin.studentStatus.findFirstOrThrow({ where: { isActive: true } }) : null;
  const fixtureUserIds: string[] = [];
  const fixtureStaffIds: string[] = [];
  if (resource === 'users') {
    for (let index = 0; index < 3; index += 1) {
      const user = await admin.user.create({ data: { email: `coord-${suffix}-${index}@example.test`, normalizedEmail: `coord-${suffix}-${index}@example.test`, passwordHash: 'fixture' } });
      const staff = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: `Fixture ${index}`, familyNameAr: 'Staff' } });
      fixtureUserIds.push(user.id);
      fixtureStaffIds.push(staff.id);
    }
  }
  async function addUsage(index: number, client: typeof prisma = admin) {
    if (resource === 'students') await client.student.create({ data: { institutionId: institution.id, nationalId: `${suffix.slice(-9)}${index}`, firstNameAr: `Student ${index}`, lastNameAr: 'Fixture', studentStatusId: studentStatus!.id } });
    if (resource === 'staff') await client.staffMember.create({ data: { institutionId: institution.id, firstNameAr: `Staff ${index}`, familyNameAr: 'Fixture' } });
    if (resource === 'users') await client.institutionUser.create({ data: { institutionId: institution.id, userId: fixtureUserIds[index], staffMemberId: fixtureStaffIds[index] } });
  }
  async function count() {
    if (resource === 'students') return admin.student.count({ where: { institutionId: institution.id, isActive: true } });
    if (resource === 'staff') return admin.staffMember.count({ where: { institutionId: institution.id, archivedAt: null } });
    return admin.institutionUser.count({ where: { institutionId: institution.id, isActive: true, archivedAt: null } });
  }
  async function cleanup() {
    await admin.institutionUser.deleteMany({ where: { institutionId: institution.id } });
    await admin.student.deleteMany({ where: { institutionId: institution.id } });
    await admin.staffMember.deleteMany({ where: { institutionId: institution.id } });
    if (fixtureUserIds.length) await admin.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
    await admin.platformAuditLog.deleteMany({ where: { targetInstitutionId: institution.id } });
    await admin.institutionSubscription.deleteMany({ where: { institutionId: institution.id } });
    await admin.plan.deleteMany({ where: { id: { in: [plan.id, target.id] } } });
    await admin.institution.delete({ where: { id: institution.id } });
  }
  async function schoolAdd(index: number) {
    return withRlsContext(institution.id, async () => {
      let status = 0; let body: any; let passed = false;
      const res: any = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } };
      await checkPlanLimit(resource)({ context: { institutionId: institution.id, academicYearId: '' } } as any, res, () => { passed = true; });
      if (passed) await addUsage(index, prisma);
      return { status: passed ? 201 : status, body };
    });
  }
  return { institution, plan, target, limitField, addUsage, count, cleanup, schoolAdd };
}

for (const resource of ['students', 'staff', 'users'] as const) {
  test(`${resource}: target Plan rejects overage and accepts matching/unlimited limits`, async () => {
    const fixture = await createFixture(resource);
    try {
      await fixture.addUsage(0);
      await fixture.addUsage(1);
      const req = { params: { id: fixture.institution.id }, body: { planId: fixture.target.id } };
      const rejected = await invoke(assignSubscription, req);
      assert.equal(rejected.status, 409);
      assert.equal(rejected.body.code, 'PLAN_LIMIT_BELOW_USAGE');
      assert.equal(rejected.body.field, fixture.limitField);
      assert.equal(rejected.body.currentUsage, 2);
      assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: fixture.institution.id, status: 'ACTIVE' } })).planId, fixture.plan.id);
      await admin.plan.update({ where: { id: fixture.target.id }, data: { [fixture.limitField]: 2 } });
      assert.equal((await invoke(assignSubscription, req)).status, 201);
      await admin.plan.update({ where: { id: fixture.target.id }, data: { [fixture.limitField]: null } });
      assert.equal((await invoke(assignSubscription, req)).status, 201);
    } finally { await fixture.cleanup(); }
  });

  test(`${resource}: school wins Plan lowering race`, async () => {
    const fixture = await createFixture(resource);
    const checked = gate(); const release = gate();
    try {
      await fixture.addUsage(0);
      const school = withRlsContext(fixture.institution.id, async () => {
        let passed = false;
        await checkPlanLimit(resource)({ context: { institutionId: fixture.institution.id, academicYearId: '' } } as any, { status: () => { throw Error('school unexpectedly rejected'); } } as any, () => { passed = true; });
        assert.equal(passed, true);
        checked.release();
        await release.promise;
        await fixture.addUsage(1, prisma);
      });
      await checked.promise;
      const lowering = invoke(updatePlan, { params: { id: fixture.plan.id }, body: { [fixture.limitField]: 1 } });
      release.release();
      await school;
      const result = await lowering;
      assert.equal(result.status, 409);
      assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
      assert.equal(await fixture.count(), 2);
      assert.equal((await admin.plan.findUniqueOrThrow({ where: { id: fixture.plan.id } }))[fixture.limitField], 2);
    } finally { release.release(); await fixture.cleanup(); }
  });

  test(`${resource}: Platform wins Plan lowering race`, async () => {
    const fixture = await createFixture(resource);
    const locked = gate(); const release = gate();
    try {
      await fixture.addUsage(0);
      const platform = platformPrisma.$transaction(async (tx) => {
        assert.equal(await lockPlatformPlan(tx, fixture.plan.id), true);
        assert.equal(await lockPlatformInstitution(tx, fixture.institution.id), true);
        locked.release();
        await release.promise;
        await tx.plan.update({ where: { id: fixture.plan.id }, data: { [fixture.limitField]: 1 } });
      });
      await locked.promise;
      const school = fixture.schoolAdd(1);
      release.release();
      await platform;
      const result = await school;
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'PLAN_LIMIT_REACHED');
      assert.equal(await fixture.count(), 1);
      assert.equal((await admin.plan.findUniqueOrThrow({ where: { id: fixture.plan.id } }))[fixture.limitField], 1);
    } finally { release.release(); await fixture.cleanup(); }
  });

  test(`${resource}: school wins target subscription assignment race`, async () => {
    const fixture = await createFixture(resource);
    const checked = gate(); const release = gate();
    try {
      await fixture.addUsage(0);
      const school = withRlsContext(fixture.institution.id, async () => {
        let passed = false;
        await checkPlanLimit(resource)({ context: { institutionId: fixture.institution.id, academicYearId: '' } } as any, { status: () => { throw Error('school unexpectedly rejected'); } } as any, () => { passed = true; });
        assert.equal(passed, true);
        checked.release();
        await release.promise;
        await fixture.addUsage(1, prisma);
      });
      await checked.promise;
      const assignment = invoke(assignSubscription, { params: { id: fixture.institution.id }, body: { planId: fixture.target.id } });
      release.release();
      await school;
      const result = await assignment;
      assert.equal(result.status, 409);
      assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
      assert.equal(await fixture.count(), 2);
      assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: fixture.institution.id, status: 'ACTIVE' } })).planId, fixture.plan.id);
    } finally { release.release(); await fixture.cleanup(); }
  });

  test(`${resource}: Platform wins target subscription assignment race`, async () => {
    const fixture = await createFixture(resource);
    const locked = gate(); const release = gate();
    try {
      await fixture.addUsage(0);
      const platform = platformPrisma.$transaction(async (tx) => {
        assert.equal(await lockPlatformPlan(tx, fixture.target.id), true);
        assert.equal(await lockPlatformInstitution(tx, fixture.institution.id), true);
        locked.release();
        await release.promise;
        await assignPlatformSubscriptionInTransaction(tx, { institutionId: fixture.institution.id, planId: fixture.target.id });
      });
      await locked.promise;
      const school = fixture.schoolAdd(1);
      release.release();
      await platform;
      const result = await school;
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'PLAN_LIMIT_REACHED');
      assert.equal(await fixture.count(), 1);
      assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: fixture.institution.id, status: 'ACTIVE' } })).planId, fixture.target.id);
    } finally { release.release(); await fixture.cleanup(); }
  });
}

test('an institution entering a Plan joins the locked subscriber set before lowering', async () => {
  const planOwner = await createFixture('students');
  const joining = await createFixture('students');
  const locked = gate(); const release = gate();
  try {
    await planOwner.addUsage(0);
    await joining.addUsage(0);
    await joining.addUsage(1);
    const assignment = platformPrisma.$transaction(async (tx) => {
      assert.equal(await lockPlatformPlan(tx, planOwner.plan.id), true);
      assert.equal(await lockPlatformInstitution(tx, joining.institution.id), true);
      locked.release();
      await release.promise;
      await assignPlatformSubscriptionInTransaction(tx, { institutionId: joining.institution.id, planId: planOwner.plan.id });
    });
    await locked.promise;
    const lowering = invoke(updatePlan, { params: { id: planOwner.plan.id }, body: { maxStudents: 1 } });
    release.release();
    await assignment;
    const result = await lowering;
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
    assert.equal((await admin.plan.findUniqueOrThrow({ where: { id: planOwner.plan.id } })).maxStudents, 2);
  } finally { release.release(); await joining.cleanup(); await planOwner.cleanup(); }
});

test('moving out of a Plan is re-read after institution locking', async () => {
  const fixture = await createFixture('students');
  const locked = gate(); const release = gate();
  try {
    await fixture.addUsage(0);
    await fixture.addUsage(1);
    await admin.plan.update({ where: { id: fixture.target.id }, data: { maxStudents: 2 } });
    const moving = platformPrisma.$transaction(async (tx) => {
      assert.equal(await lockPlatformPlan(tx, fixture.target.id), true);
      assert.equal(await lockPlatformInstitution(tx, fixture.institution.id), true);
      locked.release();
      await release.promise;
      await assignPlatformSubscriptionInTransaction(tx, { institutionId: fixture.institution.id, planId: fixture.target.id });
    });
    await locked.promise;
    const lowering = invoke(updatePlan, { params: { id: fixture.plan.id }, body: { maxStudents: 1 } });
    release.release();
    await moving;
    const result = await lowering;
    assert.equal(result.status, 200);
    assert.equal(result.body.maxStudents, 1);
    assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: fixture.institution.id, status: 'ACTIVE' } })).planId, fixture.target.id);
  } finally { release.release(); await fixture.cleanup(); }
});

test('opposite Plan reassignments finish without a lock cycle', async () => {
  const a = await createFixture('students');
  const b = await createFixture('students');
  try {
    await a.addUsage(0);
    await b.addUsage(0);
    const [toB, toA] = await Promise.all([
      invoke(assignSubscription, { params: { id: a.institution.id }, body: { planId: b.plan.id } }),
      invoke(assignSubscription, { params: { id: b.institution.id }, body: { planId: a.plan.id } }),
    ]);
    assert.equal(toB.status, 201);
    assert.equal(toA.status, 201);
    assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: a.institution.id, status: 'ACTIVE' } })).planId, b.plan.id);
    assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: b.institution.id, status: 'ACTIVE' } })).planId, a.plan.id);
  } finally {
    await admin.institutionSubscription.deleteMany({ where: { institutionId: { in: [a.institution.id, b.institution.id] } } });
    await b.cleanup();
    await a.cleanup();
  }
});

test('Plan lowering locks two subscriber institutions in stable order', async () => {
  const a = await createFixture('students');
  const b = await createFixture('students');
  const checked = gate(); const release = gate();
  try {
    await admin.institutionSubscription.updateMany({ where: { institutionId: b.institution.id, status: 'ACTIVE' }, data: { planId: a.plan.id } });
    await a.addUsage(0);
    await b.addUsage(0);
    const school = withRlsContext(b.institution.id, async () => {
      let passed = false;
      await checkPlanLimit('students')({ context: { institutionId: b.institution.id, academicYearId: '' } } as any, { status: () => { throw Error('school unexpectedly rejected'); } } as any, () => { passed = true; });
      assert.equal(passed, true);
      checked.release();
      await release.promise;
      await b.addUsage(1, prisma);
    });
    await checked.promise;
    const lowering = invoke(updatePlan, { params: { id: a.plan.id }, body: { maxStudents: 1 } });
    release.release();
    await school;
    const result = await lowering;
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'PLAN_LIMIT_BELOW_USAGE');
    assert.equal(await b.count(), 2);
  } finally { release.release(); await b.cleanup(); await a.cleanup(); }
});

test('different Plans and institutions do not share a global lock', async () => {
  const a = await createFixture('students');
  const b = await createFixture('students');
  const locked = gate(); const release = gate();
  try {
    const holding = platformPrisma.$transaction(async (tx) => {
      assert.equal(await lockPlatformPlan(tx, a.plan.id), true);
      assert.equal(await lockPlatformInstitution(tx, a.institution.id), true);
      locked.release();
      await release.promise;
    });
    await locked.promise;
    const unrelated = await invoke(updatePlan, { params: { id: b.plan.id }, body: { maxStudents: 1 } });
    assert.equal(unrelated.status, 200);
    release.release();
    await holding;
  } finally { release.release(); await b.cleanup(); await a.cleanup(); }
});

test('reactivation and renewal cannot activate a subscription below current usage', async () => {
  const fixture = await createFixture('students');
  try {
    await fixture.addUsage(0);
    await fixture.addUsage(1);
    await admin.plan.update({ where: { id: fixture.plan.id }, data: { maxStudents: 1 } });
    await admin.institutionSubscription.updateMany({ where: { institutionId: fixture.institution.id, status: 'ACTIVE' }, data: { status: 'SUSPENDED' } });
    const transition = await invoke(transitionSubscription, { params: { id: fixture.institution.id }, body: { status: 'ACTIVE' } });
    assert.equal(transition.status, 409);
    assert.equal(transition.body.code, 'PLAN_LIMIT_BELOW_USAGE');
    const renewal = await invoke(renewSubscription, { params: { id: fixture.institution.id }, body: { endsAt: new Date(Date.now() + 86_400_000).toISOString() } });
    assert.equal(renewal.status, 409);
    assert.equal(renewal.body.code, 'PLAN_LIMIT_BELOW_USAGE');
    assert.equal((await admin.institutionSubscription.findFirstOrThrow({ where: { institutionId: fixture.institution.id, status: 'SUSPENDED' } })).planId, fixture.plan.id);
    await admin.plan.update({ where: { id: fixture.plan.id }, data: { maxStudents: 2 } });
    assert.equal((await invoke(transitionSubscription, { params: { id: fixture.institution.id }, body: { status: 'ACTIVE' } })).status, 200);
  } finally { await fixture.cleanup(); }
});

test('Plan raises, unlimited limits, and metadata updates retain their contract', async () => {
  const fixture = await createFixture('students');
  try {
    await fixture.addUsage(0);
    await fixture.addUsage(1);
    assert.equal((await invoke(updatePlan, { params: { id: fixture.plan.id }, body: { maxStudents: 3 } })).status, 200);
    assert.equal((await invoke(updatePlan, { params: { id: fixture.plan.id }, body: { maxStudents: null } })).status, 200);
    const metadata = await invoke(updatePlan, { params: { id: fixture.plan.id }, body: { nameAr: 'Updated name' } });
    assert.equal(metadata.status, 200);
    assert.equal(metadata.body.nameAr, 'Updated name');
  } finally { await fixture.cleanup(); }
});
