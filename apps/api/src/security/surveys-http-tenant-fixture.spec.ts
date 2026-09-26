import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';
import { createServer } from 'node:http';
import app from '../server';

type Fixture = { institutions: string[]; years: string[]; users: string[]; staff: string[]; memberships: string[]; roles: string[]; survey: string; section: string; emails: string[]; tokens: string[] };

async function createFixture(): Promise<Fixture> {
  const [type, region, status, language] = await Promise.all([admin.educationType.findFirstOrThrow(), admin.region.findFirstOrThrow(), admin.institutionStatus.findFirstOrThrow(), admin.language.findFirstOrThrow()]);
  const marker = `SURVEYS_HTTP_TENANT_${randomUUID()}`;
  const a = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`, nameAr: marker, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const b = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`, nameAr: marker, typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const ya = await admin.academicYear.create({ data: { institutionId: a.id, yearLabel: marker, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } }); const yb = await admin.academicYear.create({ data: { institutionId: b.id, yearLabel: marker, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const [read, update] = await Promise.all([admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'READ' } } }), admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } })]);
  const users: string[] = [], staff: string[] = [], memberships: string[] = [], roles: string[] = [], emails: string[] = [], tokens: string[] = [];
  for (const institutionId of [a.id, b.id]) { const email=`${randomUUID()}@fixture.test`; const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'fixture-only' } }); users.push(user.id); emails.push(email); const member = await admin.staffMember.create({ data: { institutionId, firstNameAr: marker, familyNameAr: marker } }); staff.push(member.id); const membership = await admin.institutionUser.create({ data: { institutionId, userId: user.id, staffMemberId: member.id } }); memberships.push(membership.id); const role = await admin.role.create({ data: { institutionId, nameAr: marker } }); roles.push(role.id); await admin.institutionUserRole.create({ data: { institutionId, institutionUserId: membership.id, roleId: role.id } }); await admin.rolePermission.createMany({data:[read,update].map(p=>({institutionId,roleId:role.id,permissionId:p.id}))}); tokens.push(await createLocalAccessToken(user.id,email)); }
  const survey = await admin.survey.create({ data: { institutionId: a.id, academicYearId: ya.id, nameAr: marker } }); const section = await admin.surveySection.create({ data: { institutionId: a.id, surveyId: survey.id, code: 'FIXTURE', nameAr: marker } });
  return { institutions: [a.id, b.id], years: [ya.id, yb.id], users, staff, memberships, roles, survey: survey.id, section: section.id, emails, tokens };
}
async function cleanup(f: Fixture) { // FK order: survey children, role assignments, memberships, roles, staff, users, years, institutions.
  await admin.surveySection.deleteMany({ where: { id: f.section } }); await admin.survey.deleteMany({ where: { id: f.survey } }); await admin.institutionUserRole.deleteMany({ where: { institutionUserId: { in: f.memberships } } }); await admin.institutionUser.deleteMany({ where: { id: { in: f.memberships } } }); await admin.role.deleteMany({ where: { id: { in: f.roles } } }); await admin.staffMember.deleteMany({ where: { id: { in: f.staff } } }); await admin.user.deleteMany({ where: { id: { in: f.users } } }); await admin.academicYear.deleteMany({ where: { id: { in: f.years } } }); await admin.institution.deleteMany({ where: { id: { in: f.institutions } } }); }
test('survey HTTP tenant fixture cleanup is ID-scoped and complete', async () => {
  let f: Fixture | undefined;
  const witness = await admin.institution.findFirst({ select: { id: true } });
  const server = createServer(app);
  await new Promise<void>(r => server.listen(0, r));
  try {
    f = await createFixture();
    assert.equal(await admin.surveySection.count({ where: { id: f.section } }), 1);
    const surveyA = await admin.survey.findUniqueOrThrow({
      where: { id: f.survey },
      select: { nameAr: true, academicYearId: true, updatedAt: true, archivedAt: true, institutionId: true },
    });
    const port = (server.address() as any).port;
    const headers = (index: number, year: string) => ({
      authorization: `Bearer ${f!.tokens[index]}`,
      'x-institution-id': f!.institutions[index],
      'x-academic-year-id': year,
    });
    const foreignDetail = await fetch(`http://127.0.0.1:${port}/api/surveys/${f.survey}`, { headers: headers(1, f.years[1]) });
    assert.equal(foreignDetail.status, 404);
    const foreignBody = await foreignDetail.text();
    assert.equal(foreignBody.includes(f.survey), false);
    assert.equal(foreignBody.includes(surveyA.nameAr), false);
    assert.equal(foreignBody.includes(f.institutions[0]), false);

    const attemptedName = 'محاولة تعديل من المؤسسة ب';
    const foreignPatch = await fetch(`http://127.0.0.1:${port}/api/surveys/${f.survey}`, {
      method: 'PATCH',
      headers: { ...headers(1, f.years[1]), 'content-type': 'application/json' },
      body: JSON.stringify({ nameAr: attemptedName }),
    });
    assert.equal(foreignPatch.status, 404);
    const foreignPatchBody = await foreignPatch.text();
    assert.equal(foreignPatchBody.includes(f.survey), false);
    assert.equal(foreignPatchBody.includes(surveyA.nameAr), false);
    assert.equal(foreignPatchBody.includes(attemptedName), false);
    assert.equal(foreignPatchBody.includes(f.institutions[0]), false);

    const surveyAAfterPatch = await admin.survey.findUnique({ where: { id: f.survey } });
    assert.ok(surveyAAfterPatch);
    assert.equal(surveyAAfterPatch.nameAr, surveyA.nameAr);
    assert.equal(surveyAAfterPatch.updatedAt.getTime(), surveyA.updatedAt.getTime());
    assert.deepEqual(surveyAAfterPatch.archivedAt, surveyA.archivedAt);
    assert.equal(surveyAAfterPatch.institutionId, surveyA.institutionId);

    const originalSectionCount = await admin.surveySection.count({ where: { surveyId: f.survey } });
    const foreignSectionCode = 'FOREIGN_SECTION';
    const foreignSectionCreate = await fetch(`http://127.0.0.1:${port}/api/surveys/${f.survey}/sections`, {
      method: 'POST',
      headers: { ...headers(1, f.years[1]), 'content-type': 'application/json' },
      body: JSON.stringify({ code: foreignSectionCode, nameAr: 'قسم غير شرعي', sortOrder: 99 }),
    });
    assert.equal(foreignSectionCreate.status, 404);
    const foreignSectionBody = await foreignSectionCreate.text();
    assert.equal(foreignSectionBody.includes(f.survey), false);
    assert.equal(foreignSectionBody.includes(f.institutions[0]), false);
    assert.equal(foreignSectionBody.includes(foreignSectionCode), false);
    assert.equal(await admin.surveySection.count({ where: { surveyId: f.survey, code: foreignSectionCode } }), 0);
    assert.equal(await admin.surveySection.count({ where: { surveyId: f.survey } }), originalSectionCount);

    const foreignList = await fetch(`http://127.0.0.1:${port}/api/surveys?academicYearId=${f.years[1]}`, { headers: headers(1, f.years[1]) });
    assert.equal(foreignList.status, 200);
    const foreignListBody = await foreignList.json();
    assert.ok(Array.isArray(foreignListBody));
    assert.equal(foreignListBody.some((survey: any) => survey.id === f!.survey), false);
    const foreignListText = JSON.stringify(foreignListBody);
    assert.equal(foreignListText.includes(surveyA.nameAr), false);
    assert.equal(foreignListText.includes(f.institutions[0]), false);

    const ownerDetail = await fetch(`http://127.0.0.1:${port}/api/surveys/${f.survey}`, { headers: headers(0, f.years[0]) });
    assert.equal(ownerDetail.status, 200);
    const ownerBody = await ownerDetail.json();
    assert.equal(ownerBody.id, f.survey);
    assert.equal(ownerBody.nameAr, surveyA.nameAr);
    assert.equal(ownerBody.academicYearId, surveyA.academicYearId);
    assert.equal(ownerBody.archivedAt, surveyA.archivedAt?.toISOString() ?? null);

    const ownerStructure = await fetch(`http://127.0.0.1:${port}/api/surveys/${f.survey}/structure`, { headers: headers(0, f.years[0]) });
    assert.equal(ownerStructure.status, 200);
    const ownerStructureBody = await ownerStructure.json();
    assert.equal(ownerStructureBody.survey.id, f.survey);
    assert.equal(ownerStructureBody.sections.length, originalSectionCount);
    assert.ok(ownerStructureBody.sections.some((section: any) => section.id === f!.section));
    assert.equal(ownerStructureBody.sections.some((section: any) => section.code === foreignSectionCode), false);

    const ownerList = await fetch(`http://127.0.0.1:${port}/api/surveys?academicYearId=${f.years[0]}`, { headers: headers(0, f.years[0]) });
    assert.equal(ownerList.status, 200);
    assert.ok((await ownerList.json()).some((survey: any) => survey.id === f!.survey));
  } finally {
    if (f) await cleanup(f);
    await new Promise<void>(r => server.close(() => r()));
  }
  assert.ok(witness ? await admin.institution.findUnique({ where: { id: witness.id } }) : true);
  if (f) {
    assert.equal(await admin.survey.count({ where: { id: f.survey } }), 0);
    assert.equal(await admin.surveySection.count({ where: { id: f.section } }), 0);
    assert.equal(await admin.institutionUserRole.count({ where: { OR: [{ institutionUserId: { in: f.memberships } }, { roleId: { in: f.roles } }] } }), 0);
    assert.equal(await admin.rolePermission.count({ where: { roleId: { in: f.roles } } }), 0);
    assert.equal(await admin.institutionUser.count({ where: { id: { in: f.memberships } } }), 0);
    assert.equal(await admin.role.count({ where: { id: { in: f.roles } } }), 0);
    assert.equal(await admin.staffMember.count({ where: { id: { in: f.staff } } }), 0);
    assert.equal(await admin.institution.count({ where: { id: { in: f.institutions } } }), 0);
    assert.equal(await admin.user.count({ where: { id: { in: f.users } } }), 0);
    assert.equal(await admin.academicYear.count({ where: { id: { in: f.years } } }), 0);
    assert.ok(await admin.permission.findUnique({ where: { module_action: { module: 'surveys', action: 'READ' } } }));
    assert.ok(await admin.permission.findUnique({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } }));
  }
  await admin.$disconnect();
});
