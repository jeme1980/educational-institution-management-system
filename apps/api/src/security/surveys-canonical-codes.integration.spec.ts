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
  surveyIds: string[];
  sectionIds: string[];
  domainIds: string[];
  indicatorIds: string[];
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
  const marker = `SURVEYS_CODES_${randomUUID()}`;
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
  const surveys = await Promise.all([
    admin.survey.create({ data: { institutionId: institution.id, academicYearId: academicYear.id, nameAr: `${marker}_A` } }),
    admin.survey.create({ data: { institutionId: institution.id, academicYearId: academicYear.id, nameAr: `${marker}_B` } }),
  ]);
  return {
    institutionId: institution.id,
    academicYearId: academicYear.id,
    userId: user.id,
    staffId: staff.id,
    membershipId: membership.id,
    roleId: role.id,
    surveyIds: surveys.map((survey) => survey.id),
    sectionIds: [],
    domainIds: [],
    indicatorIds: [],
    token: await createLocalAccessToken(user.id, email),
  };
}

async function cleanup(fixture: Fixture): Promise<void> {
  if (fixture.indicatorIds.length) await admin.surveyIndicator.deleteMany({ where: { id: { in: fixture.indicatorIds } } });
  if (fixture.domainIds.length) await admin.surveyDomain.deleteMany({ where: { id: { in: fixture.domainIds } } });
  if (fixture.sectionIds.length) await admin.surveySection.deleteMany({ where: { id: { in: fixture.sectionIds } } });
  await admin.survey.deleteMany({ where: { id: { in: fixture.surveyIds } } });
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

test('survey section and indicator codes are canonical and unique per survey over HTTP', async () => {
  let fixture: Fixture | undefined;
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    fixture = await createFixture();
    const port = (server.address() as { port: number }).port;
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      'x-institution-id': fixture.institutionId,
      'x-academic-year-id': fixture.academicYearId,
      'content-type': 'application/json',
    };
    const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}/api${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const [surveyAId, surveyBId] = fixture.surveyIds;
    const sectionCode = 'MIXED_SECTION';
    const indicatorCode = 'MIXED_INDICATOR';

    const sectionA = await post(`/surveys/${surveyAId}/sections`, { code: '  mixed section  ', nameAr: 'Section A' });
    assert.equal(sectionA.status, 201);
    const sectionABody = await sectionA.json();
    fixture.sectionIds.push(sectionABody.id);
    assert.equal(sectionABody.code, sectionCode);

    const duplicateSection = await post(`/surveys/${surveyAId}/sections`, { code: 'MiXeD   SeCtIoN', nameAr: 'Duplicate Section' });
    assert.equal(duplicateSection.status, 409);
    assert.equal((await duplicateSection.json()).error.code, 'DUPLICATE_SURVEY_SECTION_CODE');
    assert.equal(await admin.surveySection.count({ where: { surveyId: surveyAId, code: sectionCode } }), 1);

    const sectionB = await post(`/surveys/${surveyBId}/sections`, { code: 'mixed section', nameAr: 'Section B' });
    assert.equal(sectionB.status, 201);
    const sectionBBody = await sectionB.json();
    fixture.sectionIds.push(sectionBBody.id);
    assert.equal(sectionBBody.code, sectionCode);

    const domainA1 = await post(`/surveys/${surveyAId}/domains`, { sectionId: sectionABody.id, code: 'domain one', nameAr: 'Domain A1' });
    assert.equal(domainA1.status, 201);
    const domainA1Body = await domainA1.json();
    fixture.domainIds.push(domainA1Body.id);
    const domainA2 = await post(`/surveys/${surveyAId}/domains`, { sectionId: sectionABody.id, code: 'domain two', nameAr: 'Domain A2' });
    assert.equal(domainA2.status, 201);
    const domainA2Body = await domainA2.json();
    fixture.domainIds.push(domainA2Body.id);

    const indicatorA = await post(`/surveys/${surveyAId}/indicators`, { domainId: domainA1Body.id, code: '  mixed indicator  ', textAr: 'Indicator A' });
    assert.equal(indicatorA.status, 201);
    const indicatorABody = await indicatorA.json();
    fixture.indicatorIds.push(indicatorABody.id);
    assert.equal(indicatorABody.code, indicatorCode);

    const duplicateIndicator = await post(`/surveys/${surveyAId}/indicators`, { domainId: domainA2Body.id, code: 'MiXeD   InDiCaToR', textAr: 'Duplicate Indicator' });
    assert.equal(duplicateIndicator.status, 409);
    assert.equal((await duplicateIndicator.json()).error.code, 'DUPLICATE_SURVEY_INDICATOR_CODE');
    assert.equal(await admin.surveyIndicator.count({ where: { surveyId: surveyAId, code: indicatorCode } }), 1);

    const domainB = await post(`/surveys/${surveyBId}/domains`, { sectionId: sectionBBody.id, code: 'domain one', nameAr: 'Domain B' });
    assert.equal(domainB.status, 201);
    const domainBBody = await domainB.json();
    fixture.domainIds.push(domainBBody.id);
    const indicatorB = await post(`/surveys/${surveyBId}/indicators`, { domainId: domainBBody.id, code: 'mixed indicator', textAr: 'Indicator B' });
    assert.equal(indicatorB.status, 201);
    const indicatorBBody = await indicatorB.json();
    fixture.indicatorIds.push(indicatorBBody.id);
    assert.equal(indicatorBBody.code, indicatorCode);

    assert.equal(await admin.surveySection.count({ where: { surveyId: surveyAId } }), 1);
    assert.equal(await admin.surveySection.count({ where: { surveyId: surveyBId } }), 1);
    assert.equal(await admin.surveyDomain.count({ where: { surveyId: surveyAId } }), 2);
    assert.equal(await admin.surveyDomain.count({ where: { surveyId: surveyBId } }), 1);
    assert.equal(await admin.surveyIndicator.count({ where: { surveyId: surveyAId } }), 1);
    assert.equal(await admin.surveyIndicator.count({ where: { surveyId: surveyBId } }), 1);

    const structureA = await fetch(`http://127.0.0.1:${port}/api/surveys/${surveyAId}/structure`, { headers });
    assert.equal(structureA.status, 200);
    const structureABody = await structureA.json();
    assert.equal(structureABody.sections.length, 1);
    assert.equal(structureABody.sections[0].domains.length, 2);
    assert.equal(structureABody.sections[0].domains.flatMap((domain: any) => domain.indicators).length, 1);
  } finally {
    if (fixture) await cleanup(fixture);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (fixture) {
    assert.equal(await admin.surveyIndicator.count({ where: { id: { in: fixture.indicatorIds } } }), 0);
    assert.equal(await admin.surveyDomain.count({ where: { id: { in: fixture.domainIds } } }), 0);
    assert.equal(await admin.surveySection.count({ where: { id: { in: fixture.sectionIds } } }), 0);
    assert.equal(await admin.survey.count({ where: { id: { in: fixture.surveyIds } } }), 0);
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
