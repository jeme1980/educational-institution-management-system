import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test, { after } from 'node:test';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import app from '../server';
import { prisma } from '../db/prisma';
import { platformPrisma } from '../db/platform-prisma';
import { createLocalAccessToken } from '../middleware/auth';
import { MAX_SPREADSHEET_FILE_BYTES, XLSX_MIME } from './spreadsheet-security';

after(async () => {
  await Promise.all([prisma.$disconnect(), platformPrisma.$disconnect()]);
});

const adminUrl = process.env['TEST_ADMIN_DATABASE_URL'] || process.env['MIGRATION_DATABASE_URL'] || process.env['DATABASE_URL'];
const json = async (response: Response) => response.json().catch(() => null);

async function xlsx(headers: string[], rows: unknown[][], extraSheet = false): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');
  sheet.addRow(headers); rows.forEach(row => sheet.addRow(row));
  if (extraSheet) workbook.addWorksheet('Extra');
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('Phase 10C-6B: HTTP spreadsheet import is authenticated, RLS-bound, atomic, and audited', async (context) => {
  assert.ok(adminUrl, 'TEST_ADMIN_DATABASE_URL, MIGRATION_DATABASE_URL, or DATABASE_URL is required for fixtures.');
  assert.notEqual(process.env['NODE_ENV'], 'production', 'Integration fixtures are disabled in production.');
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  const suffix = randomUUID().slice(0, 8);
  const server = createServer(app);
  const tracked = { users: [] as string[], staff: [] as string[], memberships: [] as string[], roles: [] as string[], students: [] as string[], enrollments: [] as string[], groups: [] as string[], exams: [] as string[], questions: [] as string[], subjects: [] as string[], classes: [] as string[], examTypes: [] as string[], questionTypes: [] as string[] };
  try {
    const institution = await admin.institution.findFirstOrThrow({ where: { archivedAt: null, academicYears: { some: { isCurrent: true, archivedAt: null } } } });
    const year = await admin.academicYear.findFirstOrThrow({ where: { institutionId: institution.id, isCurrent: true, archivedAt: null } });
    const period = await admin.academicPeriod.findFirstOrThrow({ where: { institutionId: institution.id, academicYearId: year.id, isActive: true, archivedAt: null } });
    const [stage, grade, classType, composition, enrollmentStatus, studentStatus, gender] = await Promise.all([
      admin.educationStage.findFirstOrThrow({ where: { isActive: true } }), admin.gradeLevel.findFirstOrThrow({ where: { isActive: true } }), admin.classType.findFirstOrThrow({ where: { isActive: true } }), admin.compositionType.findFirstOrThrow({ where: { isActive: true } }), admin.enrollmentStatus.findFirstOrThrow({ where: { isActive: true } }), admin.studentStatus.findFirstOrThrow({ where: { isActive: true } }), admin.gender.findFirstOrThrow({ where: { isActive: true } }),
    ]);
    const classRoom = await admin.class.create({ data: { institutionId: institution.id, academicYearId: year.id, stageId: stage.id, gradeLevelId: grade.id, typeId: classType.id, compositionId: composition.id, parallelNumber: 90 + Math.floor(Math.random() * 9), classCode: `I${suffix}`, nameAr: 'صف اختبار الاستيراد' } }); tracked.classes.push(classRoom.id);
    const subject = await admin.subject.create({ data: { institutionId: institution.id, academicYearId: year.id, nameAr: `مادة اختبار ${suffix}` } }); tracked.subjects.push(subject.id);
    const examType = await admin.examType.create({ data: { institutionId: institution.id, nameAr: `نوع ${suffix}` } }); tracked.examTypes.push(examType.id);
    const questionType = await admin.questionType.create({ data: { institutionId: institution.id, nameAr: `سؤال ${suffix}` } }); tracked.questionTypes.push(questionType.id);
    const group = await admin.studyGroup.create({ data: { institutionId: institution.id, academicYearId: year.id, classId: classRoom.id, subjectId: subject.id, nameAr: 'مجموعة اختبار' } }); tracked.groups.push(group.id);
    const exam = await admin.exam.create({ data: { institutionId: institution.id, academicYearId: year.id, academicPeriodId: period.id, subjectId: subject.id, examTypeId: examType.id, titleAr: 'امتحان الاستيراد', examDate: new Date(), maxScore: 10 } }); tracked.exams.push(exam.id);
    await admin.examStudyGroup.create({ data: { institutionId: institution.id, examId: exam.id, studyGroupId: group.id } });
    const question = await admin.examQuestion.create({ data: { institutionId: institution.id, examId: exam.id, questionTypeId: questionType.id, questionNumber: 1, maxScore: 10, contentAr: 'سؤال اختبار' } }); tracked.questions.push(question.id);
    const createStudent = async (nationalId: string, eligible: boolean) => {
      const student = await admin.student.create({ data: { institutionId: institution.id, nationalId, firstNameAr: 'طالب', lastNameAr: suffix, studentStatusId: studentStatus.id, genderId: gender.id } }); tracked.students.push(student.id);
      const enrollment = await admin.studentEnrollment.create({ data: { institutionId: institution.id, academicYearId: year.id, studentId: student.id, classId: classRoom.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date() } }); tracked.enrollments.push(enrollment.id);
      if (eligible) await admin.studyGroupStudent.create({ data: { institutionId: institution.id, studyGroupId: group.id, studentEnrollmentId: enrollment.id } });
      return student;
    };
    const eligible = await createStudent(`${Date.now()}`.slice(-10), true);
    const secondEligible = await createStudent(`${Date.now() + 2}`.slice(-10), true);
    const ineligible = await createStudent(`${Date.now() + 1}`.slice(-10), false);
    const permission = await admin.permission.upsert({ where: { module_action: { module: 'exams', action: 'UPDATE' } }, update: { isActive: true }, create: { module: 'exams', action: 'UPDATE', nameAr: 'تعديل الامتحانات' } });
    const createUser = async (canImport: boolean, platform = false) => {
      const email = `${suffix}-${randomUUID().slice(0, 5)}@test.local`;
      const user = await admin.user.create({ data: { email, normalizedEmail: email, passwordHash: 'test-hash', isActive: true, isPlatformAdmin: platform } }); tracked.users.push(user.id);
      if (platform) return user;
      const staff = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'مختبر', familyNameAr: suffix, nationalId: randomUUID().replace(/-/g, '').slice(0, 10) } }); tracked.staff.push(staff.id);
      const membership = await admin.institutionUser.create({ data: { institutionId: institution.id, userId: user.id, staffMemberId: staff.id, isActive: true } }); tracked.memberships.push(membership.id);
      if (canImport) { const role = await admin.role.create({ data: { institutionId: institution.id, nameAr: `مستورد ${suffix}` } }); tracked.roles.push(role.id); await admin.rolePermission.create({ data: { institutionId: institution.id, roleId: role.id, permissionId: permission.id } }); await admin.institutionUserRole.create({ data: { institutionId: institution.id, institutionUserId: membership.id, roleId: role.id } }); }
      return user;
    };
    const importer = await createUser(true); const denied = await createUser(false); const platform = await createUser(false, true);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address !== 'string'); const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = await createLocalAccessToken(importer.id, importer.email); const headers = { authorization: `Bearer ${token}`, 'x-institution-id': institution.id, 'x-academic-year-id': year.id, 'content-type': XLSX_MIME };
    const upload = async (body: Uint8Array, extra: Record<string, string> = {}) => {
      const response = await fetch(`${baseUrl}/api/exams/${exam.id}/results/import`, { method: 'POST', headers: { ...headers, ...extra }, body: body as any });
      // The request-scoped RLS transaction commits immediately after the response finishes.
      await new Promise(resolve => setTimeout(resolve, 25));
      return response;
    };
    const valid = await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', 8]]);
    let response = await upload(valid); assert.equal(response.status, 200, await response.text());
    let result = await admin.studentExamResult.findFirstOrThrow({ where: { examId: exam.id, studentId: eligible.id } }); assert.equal(Number(result.totalScore), 8); assert.equal(await admin.studentQuestionScore.count({ where: { studentId: eligible.id, examQuestionId: question.id } }), 1);
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', 0], [secondEligible.nationalId, 'false', 4.5]])); assert.equal(response.status, 200, await response.text());
    assert.equal(Number((await admin.studentExamResult.findFirstOrThrow({ where: { examId: exam.id, studentId: eligible.id } })).totalScore), 0);
    assert.equal(Number((await admin.studentExamResult.findFirstOrThrow({ where: { examId: exam.id, studentId: secondEligible.id } })).totalScore), 4.5);
    response = await upload(valid); assert.equal(response.status, 200, await response.text());
    const before = await Promise.all([admin.studentExamResult.count({ where: { examId: exam.id } }), admin.studentQuestionScore.count({ where: { examQuestionId: question.id } })]);
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', 9], [ineligible.nationalId, 'false', 3]])); assert.equal(response.status, 400); assert.deepEqual(await Promise.all([admin.studentExamResult.count({ where: { examId: exam.id } }), admin.studentQuestionScore.count({ where: { examQuestionId: question.id } })]), before); result = await admin.studentExamResult.findFirstOrThrow({ where: { examId: exam.id, studentId: eligible.id } }); assert.equal(Number(result.totalScore), 8);
    response = await upload(valid, { 'content-type': 'text/plain' }); assert.equal(response.status, 400); assert.equal((await json(response)).code, 'SPREADSHEET_VALIDATION_FAILED');
    response = await upload(Buffer.from('not-an-xlsx')); assert.equal(response.status, 400);
    const formula = await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', { formula: '1+1' }]]); response = await upload(formula); assert.equal(response.status, 400);
    response = await upload(Buffer.concat([valid, Buffer.from('vbaProject.bin')])); assert.equal(response.status, 400);
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', 8]], true)); assert.equal(response.status, 400);
    response = await upload(await xlsx(Array.from({ length: 65 }, (_, index) => `column_${index}`), [])); assert.equal(response.status, 400);
    const sixtyFourHeaders = ['nationalId', 'isAbsence', `question_1_${question.id}`, ...Array.from({ length: 61 }, (_, index) => `note_${index}`)];
    response = await upload(await xlsx(sixtyFourHeaders, [[eligible.nationalId, 'false', 8]])); assert.equal(response.status, 200);
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], Array.from({ length: 5001 }, () => [eligible.nationalId, 'false', 8]))); assert.equal(response.status, 400);
    response = await upload(Buffer.alloc(MAX_SPREADSHEET_FILE_BYTES + 1)); assert.equal(response.status, 413);
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', -1]])); assert.equal(response.status, 400);
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', 'not-a-score']])); assert.equal(response.status, 400); assert.equal((await json(response)).errors[0].code, 'INVALID_QUESTION_SCORE');
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_99_${randomUUID()}`], [[eligible.nationalId, 'false', 1]])); assert.equal(response.status, 400); assert.equal((await json(response)).errors[0].code, 'QUESTION_NOT_IN_EXAM');
    response = await upload(await xlsx(['nationalId', 'isAbsence', 'question_1', `question_1_${question.id}`], [[eligible.nationalId, 'false', 1, 1]])); assert.equal(response.status, 400); assert.equal((await json(response)).errors[0].code, 'DUPLICATE_QUESTION_COLUMN');
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', 8], [eligible.nationalId, 'false', 8]])); assert.equal(response.status, 400);
    response = await upload(await xlsx(['nationalId', 'isAbsence', `question_1_${question.id}`], [[eligible.nationalId, 'false', 9]])); assert.equal(response.status, 200); result = await admin.studentExamResult.findFirstOrThrow({ where: { examId: exam.id, studentId: eligible.id } }); assert.equal(Number(result.totalScore), 9);
    const deniedToken = await createLocalAccessToken(denied.id, denied.email); response = await fetch(`${baseUrl}/api/exams/${exam.id}/results/import`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${deniedToken}` }, body: valid as any }); assert.equal(response.status, 403);
    const platformToken = await createLocalAccessToken(platform.id, platform.email); response = await fetch(`${baseUrl}/api/exams/${exam.id}/results/import`, { method: 'POST', headers: { authorization: `Bearer ${platformToken}`, 'content-type': XLSX_MIME }, body: valid as any }); assert.equal(response.status, 403);
    const audit = await admin.auditLog.findFirst({ where: { institutionId: institution.id, action: 'EXAM_RESULTS_IMPORTED', entityId: exam.id }, orderBy: { createdAt: 'desc' } }); assert.ok(audit); assert.deepEqual(Object.keys((audit.metadata || {}) as object).sort(), ['createdCount', 'examId', 'rowCount', 'updatedCount']);
    const runtime = new PrismaClient({ datasourceUrl: process.env['RLS_RUNTIME_DATABASE_URL'] }); const role = (await runtime.$queryRawUnsafe<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>>('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'))[0]; await runtime.$disconnect(); assert.deepEqual(role, { current_user: 'school_app', rolsuper: false, rolbypassrls: false });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (tracked.exams.length) await admin.auditLog.deleteMany({ where: { entityId: { in: tracked.exams } } });
    if (tracked.exams.length) { await admin.studentQuestionScore.deleteMany({ where: { examQuestionId: { in: tracked.questions } } }); await admin.studentExamResult.deleteMany({ where: { examId: { in: tracked.exams } } }); await admin.examStudyGroup.deleteMany({ where: { examId: { in: tracked.exams } } }); await admin.examQuestion.deleteMany({ where: { id: { in: tracked.questions } } }); await admin.exam.deleteMany({ where: { id: { in: tracked.exams } } }); }
    await admin.studyGroupStudent.deleteMany({ where: { studyGroupId: { in: tracked.groups } } }); await admin.studyGroup.deleteMany({ where: { id: { in: tracked.groups } } }); await admin.studentEnrollment.deleteMany({ where: { id: { in: tracked.enrollments } } }); await admin.student.deleteMany({ where: { id: { in: tracked.students } } }); await admin.institutionUserRole.deleteMany({ where: { institutionUserId: { in: tracked.memberships } } }); await admin.rolePermission.deleteMany({ where: { roleId: { in: tracked.roles } } }); await admin.institutionUser.deleteMany({ where: { id: { in: tracked.memberships } } }); await admin.role.deleteMany({ where: { id: { in: tracked.roles } } }); await admin.staffMember.deleteMany({ where: { id: { in: tracked.staff } } }); await admin.user.deleteMany({ where: { id: { in: tracked.users } } }); await admin.questionType.deleteMany({ where: { id: { in: tracked.questionTypes } } }); await admin.examType.deleteMany({ where: { id: { in: tracked.examTypes } } }); await admin.subject.deleteMany({ where: { id: { in: tracked.subjects } } }); await admin.class.deleteMany({ where: { id: { in: tracked.classes } } }); await admin.$disconnect();
  }
});
