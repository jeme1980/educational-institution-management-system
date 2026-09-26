import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

type Fixture = {
  institutionIds: string[];
  academicYearIds: string[];
  userId: string;
  staffId: string;
  membershipId: string;
  roleId: string;
  surveyIds: string[];
  roundIds: string[];
  token: string;
  marker: string;
};

async function createFixture(): Promise<Fixture> {
  const [type, region, status, language, readPermission, updatePermission] = await Promise.all([
    admin.educationType.findFirstOrThrow(),
    admin.region.findFirstOrThrow(),
    admin.institutionStatus.findFirstOrThrow(),
    admin.language.findFirstOrThrow(),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'READ' } } }),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } }),
  ]);
  const marker = `SURVEYS_BOUNDARY_${randomUUID()}`;
  const institutionA = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`.toLowerCase(), nameAr: marker, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`.toLowerCase(), nameAr: marker, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const yearA1 = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}_A1`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const yearA2 = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}_A2`, startDate: new Date('2100-09-01'), endDate: new Date('2101-06-30') } });
  const yearB1 = await admin.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `${marker}_B1`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const email = `${randomUUID()}@fixture.test`;
  const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } });
  const staff = await admin.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: marker, familyNameAr: marker } });
  const membership = await admin.institutionUser.create({ data: { institutionId: institutionA.id, userId: user.id, staffMemberId: staff.id } });
  const role = await admin.role.create({ data: { institutionId: institutionA.id, nameAr: marker } });
  await admin.institutionUserRole.create({ data: { institutionId: institutionA.id, institutionUserId: membership.id, roleId: role.id } });
  await admin.rolePermission.createMany({ data: [readPermission, updatePermission].map((permission) => ({ institutionId: institutionA.id, roleId: role.id, permissionId: permission.id })) });
  return {
    institutionIds: [institutionA.id, institutionB.id],
    academicYearIds: [yearA1.id, yearA2.id, yearB1.id],
    userId: user.id,
    staffId: staff.id,
    membershipId: membership.id,
    roleId: role.id,
    surveyIds: [],
    roundIds: [],
    token: await createLocalAccessToken(user.id, email),
    marker,
  };
}

async function cleanup(fixture: Fixture): Promise<void> {
  if (fixture.roundIds.length) await admin.surveyRound.deleteMany({ where: { id: { in: fixture.roundIds } } });
  if (fixture.surveyIds.length) await admin.survey.deleteMany({ where: { id: { in: fixture.surveyIds } } });
  await admin.auditLog.deleteMany({ where: { institutionId: { in: fixture.institutionIds } } });
  await admin.institutionUserRole.deleteMany({ where: { institutionUserId: fixture.membershipId } });
  await admin.rolePermission.deleteMany({ where: { roleId: fixture.roleId } });
  await admin.institutionUser.deleteMany({ where: { id: fixture.membershipId } });
  await admin.role.deleteMany({ where: { id: fixture.roleId } });
  await admin.staffMember.deleteMany({ where: { id: fixture.staffId } });
  await admin.user.deleteMany({ where: { id: fixture.userId } });
  await admin.academicYear.deleteMany({ where: { id: { in: fixture.academicYearIds } } });
  await admin.institution.deleteMany({ where: { id: { in: fixture.institutionIds } } });
}

test('survey and round HTTP contracts preserve institution and academic-year boundaries', async () => {
  let fixture: Fixture | undefined;
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    fixture = await createFixture();
    const [institutionAId, institutionBId] = fixture.institutionIds;
    const [yearA1Id, yearA2Id, yearB1Id] = fixture.academicYearIds;
    const port = (server.address() as { port: number }).port;
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      'x-institution-id': institutionAId,
      'x-academic-year-id': yearA1Id,
      'content-type': 'application/json',
    };
    const fixtureSurveyCount = await admin.survey.count({ where: { institutionId: { in: fixture.institutionIds } } });

    const foreignYearCreate = await fetch(`http://127.0.0.1:${port}/api/surveys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ academicYearId: yearB1Id, nameAr: `${fixture.marker}_FOREIGN` }),
    });
    assert.equal(foreignYearCreate.status, 404);
    const foreignYearBody = await foreignYearCreate.text();
    assert.ok(foreignYearBody.includes('ACADEMIC_YEAR_NOT_FOUND'));
    assert.equal(foreignYearBody.includes(institutionBId), false);
    assert.equal(foreignYearBody.includes(yearB1Id), false);
    assert.equal(await admin.survey.count({ where: { institutionId: { in: fixture.institutionIds } } }), fixtureSurveyCount);

    const validCreate = await fetch(`http://127.0.0.1:${port}/api/surveys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ academicYearId: yearA1Id, nameAr: `${fixture.marker}_VALID` }),
    });
    assert.equal(validCreate.status, 201);
    const validSurvey = await validCreate.json();
    fixture.surveyIds.push(validSurvey.id);
    assert.equal((await admin.survey.findUniqueOrThrow({ where: { id: validSurvey.id } })).academicYearId, yearA1Id);

    const yearMove = await fetch(`http://127.0.0.1:${port}/api/surveys/${validSurvey.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ academicYearId: yearA2Id }),
    });
    assert.equal(yearMove.status, 400);
    const yearMoveBody = await yearMove.json();
    assert.equal(yearMoveBody.error, 'Validation failed');
    assert.ok(yearMoveBody.issues.some((issue: any) => issue.message === 'At least one field is required.'));
    assert.equal((await admin.survey.findUniqueOrThrow({ where: { id: validSurvey.id } })).academicYearId, yearA1Id);

    const roundCreate = await fetch(`http://127.0.0.1:${port}/api/surveys/${validSurvey.id}/rounds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ academicYearId: yearA2Id, code: 'ROUND_1', nameAr: 'Round', sequenceNumber: 1 }),
    });
    assert.equal(roundCreate.status, 201);
    const round = await roundCreate.json();
    fixture.roundIds.push(round.id);
    const storedRound = await admin.surveyRound.findUniqueOrThrow({ where: { id: round.id } });
    assert.equal(storedRound.academicYearId, yearA1Id);
    assert.notEqual(storedRound.academicYearId, yearA2Id);
    assert.notEqual(storedRound.academicYearId, yearB1Id);
  } finally {
    if (fixture) await cleanup(fixture);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (fixture) {
    assert.equal(await admin.surveyRound.count({ where: { id: { in: fixture.roundIds } } }), 0);
    assert.equal(await admin.survey.count({ where: { id: { in: fixture.surveyIds } } }), 0);
    assert.equal(await admin.institutionUserRole.count({ where: { institutionUserId: fixture.membershipId } }), 0);
    assert.equal(await admin.rolePermission.count({ where: { roleId: fixture.roleId } }), 0);
    assert.equal(await admin.institutionUser.count({ where: { id: fixture.membershipId } }), 0);
    assert.equal(await admin.role.count({ where: { id: fixture.roleId } }), 0);
    assert.equal(await admin.staffMember.count({ where: { id: fixture.staffId } }), 0);
    assert.equal(await admin.user.count({ where: { id: fixture.userId } }), 0);
    assert.equal(await admin.academicYear.count({ where: { id: { in: fixture.academicYearIds } } }), 0);
    assert.equal(await admin.institution.count({ where: { id: { in: fixture.institutionIds } } }), 0);
    assert.ok(await admin.permission.findUnique({ where: { module_action: { module: 'surveys', action: 'READ' } } }));
    assert.ok(await admin.permission.findUnique({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } }));
  }
  await admin.$disconnect();
});
