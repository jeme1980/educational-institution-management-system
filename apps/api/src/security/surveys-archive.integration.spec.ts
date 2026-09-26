import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

type Fixture = {
  institutionId: string;
  academicYearId: string;
  userId: string;
  staffId: string;
  membershipId: string;
  roleId: string;
  surveyId: string;
  sectionId: string;
  roundId: string;
  segmentId: string;
  resultId: string;
  token: string;
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
  const marker = `SURVEYS_ARCHIVE_${randomUUID()}`;
  const institution = await admin.institution.create({
    data: {
      schoolCode: `${Date.now()}`.slice(-10),
      slug: marker.toLowerCase(),
      nameAr: marker,
      typeId: type.id,
      regionId: region.id,
      statusId: status.id,
      defaultLanguageId: language.id,
    },
  });
  const academicYear = await admin.academicYear.create({
    data: {
      institutionId: institution.id,
      yearLabel: marker,
      startDate: new Date('2099-09-01'),
      endDate: new Date('2100-06-30'),
    },
  });
  const email = `${randomUUID()}@fixture.test`;
  const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } });
  const staff = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: marker, familyNameAr: marker } });
  const membership = await admin.institutionUser.create({ data: { institutionId: institution.id, userId: user.id, staffMemberId: staff.id } });
  const role = await admin.role.create({ data: { institutionId: institution.id, nameAr: marker } });
  await admin.institutionUserRole.create({ data: { institutionId: institution.id, institutionUserId: membership.id, roleId: role.id } });
  await admin.rolePermission.createMany({
    data: [readPermission, updatePermission].map((permission) => ({ institutionId: institution.id, roleId: role.id, permissionId: permission.id })),
  });
  const survey = await admin.survey.create({ data: { institutionId: institution.id, academicYearId: academicYear.id, nameAr: marker } });
  const section = await admin.surveySection.create({ data: { institutionId: institution.id, surveyId: survey.id, code: 'SECTION', nameAr: marker } });
  const round = await admin.surveyRound.create({ data: { institutionId: institution.id, academicYearId: academicYear.id, surveyId: survey.id, code: 'ROUND', nameAr: marker, sequenceNumber: 1 } });
  const segment = await admin.surveySegment.create({ data: { institutionId: institution.id, surveyId: survey.id, code: 'SEGMENT', nameAr: marker } });
  const result = await admin.surveyParticipationResult.create({
    data: {
      institutionId: institution.id,
      academicYearId: academicYear.id,
      surveyId: survey.id,
      roundId: round.id,
      segmentId: segment.id,
      participantCount: 8,
      eligibleCount: 10,
      responseRate: 80,
    },
  });
  return {
    institutionId: institution.id,
    academicYearId: academicYear.id,
    userId: user.id,
    staffId: staff.id,
    membershipId: membership.id,
    roleId: role.id,
    surveyId: survey.id,
    sectionId: section.id,
    roundId: round.id,
    segmentId: segment.id,
    resultId: result.id,
    token: await createLocalAccessToken(user.id, email),
  };
}

async function cleanup(fixture: Fixture): Promise<void> {
  await admin.surveyParticipationResult.deleteMany({ where: { id: fixture.resultId } });
  await admin.surveySegment.deleteMany({ where: { id: fixture.segmentId } });
  await admin.surveyRound.deleteMany({ where: { id: fixture.roundId } });
  await admin.surveySection.deleteMany({ where: { id: fixture.sectionId } });
  await admin.survey.deleteMany({ where: { id: fixture.surveyId } });
  await admin.auditLog.deleteMany({ where: { institutionId: fixture.institutionId } });
  await admin.institutionUserRole.deleteMany({ where: { institutionUserId: fixture.membershipId } });
  await admin.rolePermission.deleteMany({ where: { roleId: fixture.roleId } });
  await admin.institutionUser.deleteMany({ where: { id: fixture.membershipId } });
  await admin.role.deleteMany({ where: { id: fixture.roleId } });
  await admin.staffMember.deleteMany({ where: { id: fixture.staffId } });
  await admin.user.deleteMany({ where: { id: fixture.userId } });
  await admin.academicYear.deleteMany({ where: { id: fixture.academicYearId } });
  await admin.institution.deleteMany({ where: { id: fixture.institutionId } });
}

test('survey archive is soft, idempotent, and preserves historical structure and results', async () => {
  let fixture: Fixture | undefined;
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    fixture = await createFixture();
    const port = (server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}/api/surveys/${fixture.surveyId}`;
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      'x-institution-id': fixture.institutionId,
      'x-academic-year-id': fixture.academicYearId,
    };

    const detailBefore = await fetch(baseUrl, { headers });
    assert.equal(detailBefore.status, 200);
    assert.equal((await detailBefore.json()).id, fixture.surveyId);
    const structureBefore = await fetch(`${baseUrl}/structure`, { headers });
    assert.equal(structureBefore.status, 200);
    const structureBeforeBody = await structureBefore.json();
    assert.ok(structureBeforeBody.sections.some((item: any) => item.id === fixture!.sectionId));
    assert.ok(structureBeforeBody.rounds.some((item: any) => item.id === fixture!.roundId));
    assert.ok(structureBeforeBody.segments.some((item: any) => item.id === fixture!.segmentId));

    const firstArchive = await fetch(`${baseUrl}/archive`, { method: 'PATCH', headers });
    assert.equal(firstArchive.status, 200);
    const firstArchiveBody = await firstArchive.json();
    assert.equal(firstArchiveBody.id, fixture.surveyId);
    assert.ok(firstArchiveBody.archivedAt);
    const afterFirstArchive = await admin.survey.findUniqueOrThrow({ where: { id: fixture.surveyId } });
    assert.ok(afterFirstArchive.archivedAt);
    assert.equal(await admin.surveySection.count({ where: { id: fixture.sectionId } }), 1);
    assert.equal(await admin.surveyRound.count({ where: { id: fixture.roundId } }), 1);
    assert.equal(await admin.surveySegment.count({ where: { id: fixture.segmentId } }), 1);
    assert.equal(await admin.surveyParticipationResult.count({ where: { id: fixture.resultId } }), 1);

    const secondArchive = await fetch(`${baseUrl}/archive`, { method: 'PATCH', headers });
    assert.equal(secondArchive.status, 200);
    const secondArchiveBody = await secondArchive.json();
    assert.equal(secondArchiveBody.archivedAt, firstArchiveBody.archivedAt);
    const afterSecondArchive = await admin.survey.findUniqueOrThrow({ where: { id: fixture.surveyId } });
    assert.equal(afterSecondArchive.archivedAt?.getTime(), afterFirstArchive.archivedAt?.getTime());
    assert.equal(afterSecondArchive.updatedAt.getTime(), afterFirstArchive.updatedAt.getTime());
    assert.equal(await admin.survey.count({ where: { id: fixture.surveyId } }), 1);
    assert.equal(await admin.surveySection.count({ where: { id: fixture.sectionId } }), 1);
    assert.equal(await admin.surveyRound.count({ where: { id: fixture.roundId } }), 1);
    assert.equal(await admin.surveySegment.count({ where: { id: fixture.segmentId } }), 1);
    assert.equal(await admin.surveyParticipationResult.count({ where: { id: fixture.resultId } }), 1);

    const defaultList = await fetch(`http://127.0.0.1:${port}/api/surveys?academicYearId=${fixture.academicYearId}`, { headers });
    assert.equal(defaultList.status, 200);
    assert.equal((await defaultList.json()).some((item: any) => item.id === fixture!.surveyId), false);

    const archivedDetail = await fetch(baseUrl, { headers });
    assert.equal(archivedDetail.status, 200);
    assert.equal((await archivedDetail.json()).archivedAt, firstArchiveBody.archivedAt);
    const archivedStructure = await fetch(`${baseUrl}/structure`, { headers });
    assert.equal(archivedStructure.status, 200);
    const archivedStructureBody = await archivedStructure.json();
    assert.equal(archivedStructureBody.survey.id, fixture.surveyId);
    assert.ok(archivedStructureBody.sections.some((item: any) => item.id === fixture!.sectionId));
    assert.ok(archivedStructureBody.rounds.some((item: any) => item.id === fixture!.roundId));
    assert.ok(archivedStructureBody.segments.some((item: any) => item.id === fixture!.segmentId));

    const archivedMutation = await fetch(baseUrl, {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ descriptionAr: 'Presentation change after archive' }),
    });
    assert.equal(archivedMutation.status, 409);
    assert.equal((await archivedMutation.json()).error.code, 'SURVEY_ARCHIVED');

    const deleteRequest = await fetch(baseUrl, { method: 'DELETE', headers });
    assert.ok([404, 405].includes(deleteRequest.status));

    assert.equal(await admin.survey.count({ where: { id: fixture.surveyId } }), 1);
    assert.equal(await admin.surveySection.count({ where: { id: fixture.sectionId } }), 1);
    assert.equal(await admin.surveyRound.count({ where: { id: fixture.roundId } }), 1);
    assert.equal(await admin.surveySegment.count({ where: { id: fixture.segmentId } }), 1);
    assert.equal(await admin.surveyParticipationResult.count({ where: { id: fixture.resultId } }), 1);
  } finally {
    if (fixture) await cleanup(fixture);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (fixture) {
    assert.equal(await admin.surveyParticipationResult.count({ where: { id: fixture.resultId } }), 0);
    assert.equal(await admin.surveySegment.count({ where: { id: fixture.segmentId } }), 0);
    assert.equal(await admin.surveyRound.count({ where: { id: fixture.roundId } }), 0);
    assert.equal(await admin.surveySection.count({ where: { id: fixture.sectionId } }), 0);
    assert.equal(await admin.survey.count({ where: { id: fixture.surveyId } }), 0);
    assert.equal(await admin.institutionUserRole.count({ where: { institutionUserId: fixture.membershipId } }), 0);
    assert.equal(await admin.rolePermission.count({ where: { roleId: fixture.roleId } }), 0);
    assert.equal(await admin.institutionUser.count({ where: { id: fixture.membershipId } }), 0);
    assert.equal(await admin.role.count({ where: { id: fixture.roleId } }), 0);
    assert.equal(await admin.staffMember.count({ where: { id: fixture.staffId } }), 0);
    assert.equal(await admin.user.count({ where: { id: fixture.userId } }), 0);
    assert.equal(await admin.academicYear.count({ where: { id: fixture.academicYearId } }), 0);
    assert.equal(await admin.institution.count({ where: { id: fixture.institutionId } }), 0);
    assert.ok(await admin.permission.findUnique({ where: { module_action: { module: 'surveys', action: 'READ' } } }));
    assert.ok(await admin.permission.findUnique({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } }));
  }
  await admin.$disconnect();
});
