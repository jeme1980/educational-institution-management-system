import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { prisma } from '../db/prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { checkPlanLimit } from './subscription.service';
import { restoreStudentsById, updateStudentsById } from '../controllers/students.controller';
import { restoreStaffById, updateStaffById } from '../controllers/staff.controller';
import { patchInstitutionUsersById } from '../controllers/users.controller';

after(async () => { await admin.$disconnect(); await prisma.$disconnect(); });

function gate() {
  let release!: () => void;
  return { promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
}

for (const resource of ['students', 'staff', 'users'] as const) {
  test(`concurrent ${resource} creation respects a one-seat plan`, async () => {
    const base = await admin.institution.findFirstOrThrow();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const institution = await admin.institution.create({ data: {
      schoolCode: `LC${suffix}`.slice(0, 20), slug: `limit-concurrency-${suffix}`,
      nameAr: 'Limit concurrency fixture', typeId: base.typeId, regionId: base.regionId,
      townId: base.townId, statusId: base.statusId, defaultLanguageId: base.defaultLanguageId,
    } });
    const plan = await admin.plan.create({ data: {
      code: `LC_${suffix}`, nameAr: 'Limit concurrency fixture',
      maxStudents: resource === 'students' ? 1 : null,
      maxStaff: resource === 'staff' ? 1 : null,
      maxUsers: resource === 'users' ? 1 : null,
    } });
    const subscription = await admin.institutionSubscription.create({ data: { institutionId: institution.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date() } });
    const status = resource === 'students' ? await admin.studentStatus.findFirstOrThrow({ where: { isActive: true } }) : null;
    const fixtureUsers: string[] = [];
    const fixtureStaff: string[] = [];
    if (resource === 'users') {
      for (let index = 0; index < 2; index += 1) {
        const user = await admin.user.create({ data: { email: `limit-${suffix}-${index}@example.test`, normalizedEmail: `limit-${suffix}-${index}@example.test`, passwordHash: 'fixture' } });
        const staff = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: `Member ${index}`, familyNameAr: 'Fixture' } });
        fixtureUsers.push(user.id);
        fixtureStaff.push(staff.id);
      }
    }
    const firstChecked = gate();
    const releaseFirst = gate();
    const secondStarted = gate();
    async function attempt(index: number, pause: boolean) {
      return withRlsContext(institution.id, async () => {
        if (!pause) secondStarted.release();
        let rejection: { status: number; body: any } | undefined;
        let passed = false;
        const req = { context: { institutionId: institution.id, academicYearId: '' } } as any;
        const res = { status: (httpStatus: number) => ({ json: (body: unknown) => { rejection = { status: httpStatus, body }; } }) } as any;
        await checkPlanLimit(resource)(req, res, () => { passed = true; });
        if (pause) { firstChecked.release(); await releaseFirst.promise; }
        if (passed) {
          if (resource === 'students') await prisma.student.create({ data: { institutionId: institution.id, nationalId: `${suffix}${index}`.slice(-10), firstNameAr: `Student ${index}`, lastNameAr: 'Fixture', studentStatusId: status!.id } });
          if (resource === 'staff') await prisma.staffMember.create({ data: { institutionId: institution.id, firstNameAr: `Staff ${index}`, familyNameAr: 'Fixture' } });
          if (resource === 'users') await prisma.institutionUser.create({ data: { institutionId: institution.id, userId: fixtureUsers[index], staffMemberId: fixtureStaff[index] } });
        }
        return { passed, rejection };
      });
    }
    try {
      const first = attempt(0, true);
      await firstChecked.promise;
      const second = attempt(1, false);
      await secondStarted.promise;
      releaseFirst.release();
      const result = await Promise.all([first, second]);
      assert.equal(result.filter((item) => item.passed).length, 1);
      assert.equal(result.filter((item) => item.rejection?.status === 403 && item.rejection.body.code === 'PLAN_LIMIT_REACHED').length, 1);
      const count = resource === 'students'
        ? await admin.student.count({ where: { institutionId: institution.id, isActive: true } })
        : resource === 'staff'
          ? await admin.staffMember.count({ where: { institutionId: institution.id, archivedAt: null } })
          : await admin.institutionUser.count({ where: { institutionId: institution.id, isActive: true, archivedAt: null } });
      assert.equal(count, 1);
      let inactiveId: string;
      if (resource === 'students') {
        const inactive = await admin.student.create({ data: { institutionId: institution.id, nationalId: `${suffix}9`.slice(-10), firstNameAr: 'Inactive', lastNameAr: 'Fixture', studentStatusId: status!.id, isActive: false } });
        inactiveId = inactive.id;
      } else if (resource === 'staff') {
        const archived = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'Archived', familyNameAr: 'Fixture', archivedAt: new Date() } });
        inactiveId = archived.id;
      } else {
        const inactive = await admin.institutionUser.create({ data: { institutionId: institution.id, userId: fixtureUsers[1], staffMemberId: fixtureStaff[1], isActive: false } });
        inactiveId = inactive.id;
      }
      await withRlsContext(institution.id, async () => {
        let rejection: { status: number; body: any } | undefined;
        const req = { context: { institutionId: institution.id, academicYearId: '' }, institutionId: institution.id, params: { id: inactiveId }, body: { isActive: true }, user: { uid: fixtureUsers[0] } } as any;
        const res = { status: (httpStatus: number) => ({ json: (body: unknown) => { rejection = { status: httpStatus, body }; } }) } as any;
        if (resource === 'students') await restoreStudentsById(req, res);
        if (resource === 'staff') await restoreStaffById(req, res);
        if (resource === 'users') await patchInstitutionUsersById(req, res);
        assert.equal(rejection?.status, 403);
        assert.equal(rejection?.body.code, 'PLAN_LIMIT_REACHED');
      });
      if (resource === 'students') assert.equal((await admin.student.findUniqueOrThrow({ where: { id: inactiveId } })).isActive, false);
      if (resource === 'staff') assert.ok((await admin.staffMember.findUniqueOrThrow({ where: { id: inactiveId } })).archivedAt);
      if (resource === 'users') assert.equal((await admin.institutionUser.findUniqueOrThrow({ where: { id: inactiveId } })).isActive, false);
      if (resource === 'students' || resource === 'staff') {
        await withRlsContext(institution.id, async () => {
          let rejection: { status: number; body: any } | undefined;
          const req = { context: { institutionId: institution.id, academicYearId: '' }, institutionId: institution.id, params: { id: inactiveId }, body: resource === 'students' ? { isActive: true } : { firstNameAr: 'Archived', familyNameAr: 'Fixture' } } as any;
          const res = { status: (httpStatus: number) => ({ json: (body: unknown) => { rejection = { status: httpStatus, body }; } }) } as any;
          if (resource === 'students') await updateStudentsById(req, res);
          else await updateStaffById(req, res);
          assert.equal(rejection?.status, 403);
          assert.equal(rejection?.body.code, 'PLAN_LIMIT_REACHED');
        });
      }
      await withRlsContext(institution.id, async () => {
        let rejected: any;
        const req = { context: { institutionId: institution.id, academicYearId: '' } } as any;
        const res = { status: (statusCode: number) => ({ json: (body: unknown) => { rejected = { statusCode, body }; } }) } as any;
        await checkPlanLimit(resource)(req, res, () => assert.fail('at-limit check must reject'));
        assert.equal(rejected.statusCode, 403);
        assert.equal(rejected.body.code, 'PLAN_LIMIT_REACHED');
      });
      await admin.plan.update({ where: { id: plan.id }, data: { [resource === 'students' ? 'maxStudents' : resource === 'staff' ? 'maxStaff' : 'maxUsers']: null } });
      await withRlsContext(institution.id, async () => {
        let passed = false;
        const req = { context: { institutionId: institution.id, academicYearId: '' } } as any;
        await checkPlanLimit(resource)(req, { status: () => { throw new Error('unlimited plan rejected'); } } as any, () => { passed = true; });
        assert.equal(passed, true);
      });
    } finally {
      releaseFirst.release();
      await admin.institutionUser.deleteMany({ where: { institutionId: institution.id } });
      await admin.student.deleteMany({ where: { institutionId: institution.id } });
      await admin.staffMember.deleteMany({ where: { institutionId: institution.id } });
      if (fixtureUsers.length) await admin.user.deleteMany({ where: { id: { in: fixtureUsers } } });
      await admin.institutionSubscription.delete({ where: { id: subscription.id } });
      await admin.plan.delete({ where: { id: plan.id } });
      await admin.institution.delete({ where: { id: institution.id } });
    }
  });
}

test('limit locks for different institutions are independent', async () => {
  const institutions = await admin.institution.findMany({ take: 2, select: { id: true } });
  assert.equal(institutions.length, 2);
  const firstLocked = gate();
  const releaseFirst = gate();
  const first = withRlsContext(institutions[0].id, async () => {
    const rows = await prisma.$transaction((tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM public.institutions WHERE id = ${institutions[0].id}::uuid FOR NO KEY UPDATE
    `);
    assert.equal(rows.length, 1);
    firstLocked.release();
    await releaseFirst.promise;
  });
  try {
    await firstLocked.promise;
    await withRlsContext(institutions[1].id, async () => {
      const rows = await prisma.$transaction((tx) => tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM public.institutions WHERE id = ${institutions[1].id}::uuid FOR NO KEY UPDATE
      `);
      assert.equal(rows.length, 1);
    });
    await withRlsContext(institutions[0].id, async () => {
      let rejected = 0;
      await checkPlanLimit('staff')(
        { context: { institutionId: institutions[1].id, academicYearId: '' } } as any,
        { status: (code: number) => ({ json: () => { rejected = code; } }) } as any,
        () => assert.fail('a foreign institution must not be locked or counted'),
      );
      assert.equal(rejected, 403);
    });
  } finally {
    releaseFirst.release();
    await first;
  }
});
