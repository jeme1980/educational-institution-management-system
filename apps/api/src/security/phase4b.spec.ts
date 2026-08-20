import { strict as assert } from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import app from '../server';
import { testAdminPrisma } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { createAuthLogin } from '../controllers/auth.controller';
import { createLocalAccessToken } from '../middleware/auth';
import { updateRolesById, patchInstitutionUsersById } from '../controllers/users.controller';
import { updateExamTypesById, deleteExamTypesById, updateQuestionTypesById, deleteQuestionTypesById, createExamsByIdResultsEnhanced } from '../controllers/exams.controller';
import { updateTopicsById, updateSkillsById } from '../controllers/subjects.controller';
import { deleteStudentsById } from '../controllers/students.controller';

type AnyRequest = Record<string, any>;

async function invoke(handler: (req: any, res: any) => Promise<any>, req: AnyRequest) {
  let statusCode = 200;
  let body: any;
  const headers = new Map<string, unknown>();
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: any) { body = value; return this; },
    getHeader(name: string) { return headers.get(name); },
    setHeader(name: string, value: unknown) { headers.set(name, value); return this; },
  };
  const institutionId = req.context?.institutionId || req.institutionId;
  if (institutionId) await withRlsContext(institutionId, () => handler(req, response));
  else await handler(req, response);
  return { statusCode, body };
}

// Fixture setup and teardown span multiple institutions and therefore use the
// platform connection. Application handlers still execute in their tenant RLS
// context through invoke().
const prisma = testAdminPrisma;

const context = (institutionId: string, academicYearId = '') => ({
  context: { institutionId, academicYearId },
  institutionId,
  user: { uid: '00000000-0000-4000-8000-000000000001', email: 'phase4b@test.local' },
});

async function main() {
  const [type, region, status, language, gender, studentStatus] = await Promise.all([
    prisma.educationType.findFirst(),
    prisma.region.findFirst(),
    prisma.institutionStatus.findFirst(),
    prisma.language.findFirst(),
    prisma.gender.findFirst(),
    prisma.studentStatus.findFirst(),
  ]);
  assert.ok(type && region && status && language && gender && studentStatus, 'Required global lookup fixtures are missing');

  const marker = `phase4b-${Date.now()}`;
  const institutionA = await prisma.institution.create({ data: { schoolCode: `${String(Date.now()).slice(-10)}`, slug: `${marker}-a`, nameAr: 'Phase 4B Institution A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const yearA = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-a`, startDate: new Date('2025-09-01'), endDate: new Date('2026-06-30'), isCurrent: false } });
  const periodA = await prisma.academicPeriod.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: `${marker}-period-a`, startDate: new Date('2025-09-01'), endDate: new Date('2026-06-30') } });
  const subjectA = await prisma.subject.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: `${marker}-subject-a` } });
  const examTypeA = await prisma.examType.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-exam-type-a` } });
  const examAFixture = await prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, academicPeriodId: periodA.id, subjectId: subjectA.id, examTypeId: examTypeA.id, titleAr: `${marker}-exam-a`, examDate: new Date('2025-10-01'), maxScore: 100 } });
  const staffA = await prisma.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: 'Phase', familyNameAr: 'A' } });
  const userA = await prisma.user.create({ data: { email: `${marker}-a@test.local`, normalizedEmail: `${marker}-a@test.local`, passwordHash: crypto.createHash('sha256').update('Phase4B!').digest('hex'), isActive: true } });
  const memberA = await prisma.institutionUser.create({ data: { institutionId: institutionA.id, userId: userA.id, staffMemberId: staffA.id, isActive: true } });
  const roleA = await prisma.role.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-a`, isSystem: false } });
  await prisma.institutionUserRole.create({ data: { institutionId: institutionA.id, institutionUserId: memberA.id, roleId: roleA.id } });
  const institutionB = await prisma.institution.create({
    data: {
      schoolCode: `${String(Date.now()).slice(-10)}`,
      slug: marker,
      nameAr: 'Phase 4B Fixture',
      typeId: type.id,
      regionId: region.id,
      statusId: status.id,
      defaultLanguageId: language.id,
    },
  });
  const yearB = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: marker, startDate: new Date('2025-09-01'), endDate: new Date('2026-06-30'), isCurrent: true } });
  const staffB = await prisma.staffMember.create({ data: { institutionId: institutionB.id, firstNameAr: 'Phase', familyNameAr: 'Fixture' } });
  const userB = await prisma.user.create({ data: { email: `${marker}@test.local`, normalizedEmail: `${marker}@test.local`, passwordHash: crypto.createHash('sha256').update('Phase4B!').digest('hex'), isActive: true } });
  const memberB = await prisma.institutionUser.create({ data: { institutionId: institutionB.id, userId: userB.id, staffMemberId: staffB.id, isActive: true } });
  const userWithoutMembership = await prisma.user.create({ data: { email: `${marker}-nomembership@test.local`, normalizedEmail: `${marker}-nomembership@test.local`, passwordHash: crypto.createHash('sha256').update('Phase4B!').digest('hex'), isActive: true } });
  const roleB = await prisma.role.create({ data: { institutionId: institutionB.id, nameAr: marker, isSystem: false } });
  const examTypeB = await prisma.examType.create({ data: { institutionId: institutionB.id, nameAr: marker } });
  const questionTypeB = await prisma.questionType.create({ data: { institutionId: institutionB.id, nameAr: marker } });
  const subjectB = await prisma.subject.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: marker } });
  const grade = await prisma.gradeLevel.findFirst();
  assert.ok(grade, 'Grade level fixture is required');
  const topicB = await prisma.topic.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, subjectId: subjectB.id, gradeLevelId: grade.id, nameAr: marker } });
  const skillB = await prisma.skill.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, subjectId: subjectB.id, gradeLevelId: grade.id, nameAr: marker } });
  const studentB = await prisma.student.create({ data: { institutionId: institutionB.id, nationalId: String(Date.now()).slice(-10), studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase', lastNameAr: 'Student' } });
  const memberARoles = await prisma.institutionUserRole.findMany({ where: { institutionId: institutionA.id, institutionUserId: memberA.id }, select: { roleId: true } });

  try {
    const login = await invoke(createAuthLogin, { body: { email: userB.email, password: 'Phase4B!' } });
    assert.equal(login.statusCode, 200, 'Valid credentials must authenticate');
    assert.ok(login.body?.token, 'Successful login must return a JWT');
    const invalid = await invoke(createAuthLogin, { body: { email: userB.email, password: 'wrong-password' } });
    assert.equal(invalid.statusCode, 401, 'Invalid credentials must be rejected');
    const noMembership = await invoke(createAuthLogin, { body: { email: userWithoutMembership.email, password: 'Phase4B!' } });
    assert.equal(noMembership.statusCode, 403, 'Users without InstitutionUser membership must not receive context');

    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const missingJwt = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`);
      assert.equal(missingJwt.status, 401, 'Missing JWT must be rejected');
      const invalidJwt = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, { headers: { Authorization: 'Bearer invalid.jwt.value' } });
      assert.equal(invalidJwt.status, 401, 'Invalid JWT must be rejected');
      const validJwt = await createLocalAccessToken(userB.id, userB.email);
      const me = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, { headers: { Authorization: `Bearer ${validJwt}` } });
      assert.equal(me.status, 200, 'Valid JWT and active membership must resolve /auth/me');
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }

    const aRequest = context(institutionA.id, yearA.id);
    assert.equal((await invoke(updateRolesById, { ...aRequest, params: { id: roleB.id }, body: { nameAr: 'blocked' } })).statusCode, 404, 'Role B must not be updateable in institution A');
    const crossRoleAssignment = await invoke(patchInstitutionUsersById, { ...aRequest, params: { id: memberA.id }, body: { roleIds: [roleB.id] } });
    assert.equal(crossRoleAssignment.statusCode, 400, 'Role B must not be assignable to InstitutionUser A');
    assert.equal((await invoke(updateExamTypesById, { ...aRequest, params: { id: examTypeB.id }, body: { nameAr: 'blocked' } })).statusCode, 404, 'ExamType B must not be updateable in institution A');
    assert.equal((await invoke(deleteExamTypesById, { ...aRequest, params: { id: examTypeB.id }, body: {} })).statusCode, 404, 'ExamType B must not be deletable in institution A');
    assert.equal((await invoke(updateQuestionTypesById, { ...aRequest, params: { id: questionTypeB.id }, body: { nameAr: 'blocked' } })).statusCode, 404, 'QuestionType B must not be updateable in institution A');
    assert.equal((await invoke(deleteQuestionTypesById, { ...aRequest, params: { id: questionTypeB.id }, body: {} })).statusCode, 404, 'QuestionType B must not be deletable in institution A');
    assert.equal((await invoke(updateTopicsById, { ...aRequest, params: { id: topicB.id }, body: { subjectId: subjectB.id, academicYearId: yearB.id, nameAr: 'blocked' } })).statusCode, 404, 'Topic B must not be updateable in institution A');
    assert.equal((await invoke(updateSkillsById, { ...aRequest, params: { id: skillB.id }, body: { subjectId: subjectB.id, academicYearId: yearB.id, nameAr: 'blocked' } })).statusCode, 404, 'Skill B must not be updateable in institution A');
    assert.equal((await invoke(deleteStudentsById, { ...aRequest, params: { id: studentB.id }, body: {} })).statusCode, 404, 'Student B must not be deletable in institution A');

    const resultAttempt = await invoke(createExamsByIdResultsEnhanced, { ...aRequest, params: { id: examAFixture.id }, body: { results: [{ studentId: studentB.id, totalScore: 0 }] } });
    assert.equal(resultAttempt.statusCode, 400, 'Exam A must reject a student from institution B / outside allowed groups');

    assert.equal(typeof gender.id, 'string');
    assert.ok(await prisma.town.findFirst(), 'Town remains a global lookup without institution scoping');
    assert.ok(await prisma.provider.findFirst(), 'Provider remains a global lookup without institution scoping');
  } finally {
    await prisma.institutionUserRole.deleteMany({ where: { institutionId: institutionA.id, institutionUserId: memberA.id } });
    if (memberARoles.length) await prisma.institutionUserRole.createMany({ data: memberARoles.map(item => ({ institutionId: institutionA.id, institutionUserId: memberA.id, roleId: item.roleId })) });
    await prisma.student.delete({ where: { id: studentB.id } });
    await prisma.institutionUser.delete({ where: { id: memberB.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userB.id, userWithoutMembership.id] } } });
    await prisma.staffMember.delete({ where: { id: staffB.id } });
    await prisma.skill.delete({ where: { id: skillB.id } });
    await prisma.topic.delete({ where: { id: topicB.id } });
    await prisma.subject.delete({ where: { id: subjectB.id } });
    await prisma.questionType.delete({ where: { id: questionTypeB.id } });
    await prisma.examType.delete({ where: { id: examTypeB.id } });
    await prisma.role.delete({ where: { id: roleB.id } });
    await prisma.academicYear.delete({ where: { id: yearB.id } });
    await prisma.institution.delete({ where: { id: institutionB.id } });
    await prisma.institutionUserRole.deleteMany({ where: { institutionId: institutionA.id } });
    await prisma.institutionUser.delete({ where: { id: memberA.id } });
    await prisma.user.delete({ where: { id: userA.id } });
    await prisma.staffMember.delete({ where: { id: staffA.id } });
    await prisma.role.delete({ where: { id: roleA.id } });
    await prisma.exam.delete({ where: { id: examAFixture.id } });
    await prisma.examType.delete({ where: { id: examTypeA.id } });
    await prisma.subject.delete({ where: { id: subjectA.id } });
    await prisma.academicPeriod.delete({ where: { id: periodA.id } });
    await prisma.academicYear.delete({ where: { id: yearA.id } });
    await prisma.institution.delete({ where: { id: institutionA.id } });
    await prisma.$disconnect();
  }
  console.log('Phase 4B security regression tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
