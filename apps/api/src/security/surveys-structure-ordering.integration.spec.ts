import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

type OrderedItem = { id: string; sortOrder: number };
type RoundItem = { id: string; sequenceNumber: number };
type Fixture = {
  institutionId: string;
  academicYearId: string;
  userId: string;
  staffId: string;
  membershipId: string;
  roleId: string;
  surveyId: string;
  sections: OrderedItem[];
  domains: OrderedItem[];
  indicators: OrderedItem[];
  rounds: RoundItem[];
  segments: OrderedItem[];
  domainSectionId: string;
  indicatorDomainId: string;
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
  const marker = `SURVEYS_ORDERING_${randomUUID()}`;
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

  const sections: OrderedItem[] = [];
  for (const [index, sortOrder] of [30, 10, 20].entries()) {
    const item = await admin.surveySection.create({ data: { institutionId: institution.id, surveyId: survey.id, code: `SECTION_${index}`, nameAr: marker, sortOrder } });
    sections.push({ id: item.id, sortOrder });
  }
  const domainSectionId = sections[2].id;
  const domains: OrderedItem[] = [];
  for (const [index, sortOrder] of [20, 5, 10].entries()) {
    const item = await admin.surveyDomain.create({ data: { institutionId: institution.id, surveyId: survey.id, sectionId: domainSectionId, code: `DOMAIN_${index}`, nameAr: marker, sortOrder } });
    domains.push({ id: item.id, sortOrder });
  }
  const indicatorDomainId = domains[2].id;
  const indicators: OrderedItem[] = [];
  for (const [index, sortOrder] of [50, 10, 30].entries()) {
    const item = await admin.surveyIndicator.create({ data: { institutionId: institution.id, surveyId: survey.id, domainId: indicatorDomainId, code: `INDICATOR_${index}`, textAr: marker, sortOrder } });
    indicators.push({ id: item.id, sortOrder });
  }
  const rounds: RoundItem[] = [];
  for (const sequenceNumber of [3, 1, 2]) {
    const item = await admin.surveyRound.create({ data: { institutionId: institution.id, academicYearId: academicYear.id, surveyId: survey.id, code: `ROUND_${sequenceNumber}`, nameAr: marker, sequenceNumber } });
    rounds.push({ id: item.id, sequenceNumber });
  }
  const segments: OrderedItem[] = [];
  for (const [index, sortOrder] of [30, 10, 20, 10].entries()) {
    const item = await admin.surveySegment.create({ data: { institutionId: institution.id, surveyId: survey.id, code: `SEGMENT_${index}`, nameAr: marker, sortOrder } });
    segments.push({ id: item.id, sortOrder });
  }

  return {
    institutionId: institution.id,
    academicYearId: academicYear.id,
    userId: user.id,
    staffId: staff.id,
    membershipId: membership.id,
    roleId: role.id,
    surveyId: survey.id,
    sections,
    domains,
    indicators,
    rounds,
    segments,
    domainSectionId,
    indicatorDomainId,
    token: await createLocalAccessToken(user.id, email),
  };
}

async function cleanup(fixture: Fixture): Promise<void> {
  await admin.surveyIndicator.deleteMany({ where: { id: { in: fixture.indicators.map((item) => item.id) } } });
  await admin.surveyDomain.deleteMany({ where: { id: { in: fixture.domains.map((item) => item.id) } } });
  await admin.surveySection.deleteMany({ where: { id: { in: fixture.sections.map((item) => item.id) } } });
  await admin.surveyRound.deleteMany({ where: { id: { in: fixture.rounds.map((item) => item.id) } } });
  await admin.surveySegment.deleteMany({ where: { id: { in: fixture.segments.map((item) => item.id) } } });
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

const orderedIds = (items: OrderedItem[]) => [...items]
  .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
  .map((item) => item.id);

test('survey structure collections use deterministic contract ordering over HTTP', async () => {
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
    };
    const url = `http://127.0.0.1:${port}/api/surveys/${fixture.surveyId}/structure`;
    const readSnapshot = async () => {
      const response = await fetch(url, { headers });
      assert.equal(response.status, 200);
      const body = await response.json();
      const section = body.sections.find((item: any) => item.id === fixture!.domainSectionId);
      const domain = section.domains.find((item: any) => item.id === fixture!.indicatorDomainId);
      return {
        sections: body.sections.map((item: any) => item.id),
        domains: section.domains.map((item: any) => item.id),
        indicators: domain.indicators.map((item: any) => item.id),
        rounds: body.rounds.map((item: any) => item.id),
        segments: body.segments.map((item: any) => item.id),
      };
    };

    const expected = {
      sections: orderedIds(fixture.sections),
      domains: orderedIds(fixture.domains),
      indicators: orderedIds(fixture.indicators),
      rounds: [...fixture.rounds].sort((left, right) => left.sequenceNumber - right.sequenceNumber).map((item) => item.id),
      segments: orderedIds(fixture.segments),
    };
    const first = await readSnapshot();
    assert.deepEqual(first, expected);
    assert.notDeepEqual(first.sections, fixture.sections.map((item) => item.id));
    assert.notDeepEqual(first.domains, fixture.domains.map((item) => item.id));
    assert.notDeepEqual(first.indicators, fixture.indicators.map((item) => item.id));
    assert.notDeepEqual(first.rounds, fixture.rounds.map((item) => item.id));
    assert.notDeepEqual(first.segments, fixture.segments.map((item) => item.id));
    const tiedSegmentIds = fixture.segments.filter((item) => item.sortOrder === 10).map((item) => item.id).sort();
    assert.deepEqual(first.segments.slice(0, tiedSegmentIds.length), tiedSegmentIds);

    const second = await readSnapshot();
    assert.deepEqual(second, first);
  } finally {
    if (fixture) await cleanup(fixture);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (fixture) {
    assert.equal(await admin.surveyIndicator.count({ where: { id: { in: fixture.indicators.map((item) => item.id) } } }), 0);
    assert.equal(await admin.surveyDomain.count({ where: { id: { in: fixture.domains.map((item) => item.id) } } }), 0);
    assert.equal(await admin.surveySection.count({ where: { id: { in: fixture.sections.map((item) => item.id) } } }), 0);
    assert.equal(await admin.surveyRound.count({ where: { id: { in: fixture.rounds.map((item) => item.id) } } }), 0);
    assert.equal(await admin.surveySegment.count({ where: { id: { in: fixture.segments.map((item) => item.id) } } }), 0);
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
