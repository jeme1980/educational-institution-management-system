import { strict as assert } from 'node:assert';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';

function isForeignKeyViolation(error: any): boolean {
  return error?.code === 'P2003' || /foreign key/i.test(String(error?.message || ''));
}

async function expectForeignKeyViolation(operation: Promise<unknown>, message: string) {
  try {
    await operation;
    assert.fail(message);
  } catch (error) {
    if ((error as any)?.code === 'ERR_ASSERTION') throw error;
    assert.ok(isForeignKeyViolation(error), `${message}: expected a foreign-key violation`);
  }
}

async function main() {
  const [permission, type, region, status, language, gender, studentStatus, stage, grade, classType, composition, enrollmentStatus] = await Promise.all([
    prisma.permission.findFirst(),
    prisma.educationType.findFirst(),
    prisma.region.findFirst(),
    prisma.institutionStatus.findFirst(),
    prisma.language.findFirst(),
    prisma.gender.findFirst(),
    prisma.studentStatus.findFirst(),
    prisma.educationStage.findFirst(),
    prisma.gradeLevel.findFirst(),
    prisma.classType.findFirst(),
    prisma.compositionType.findFirst(),
    prisma.enrollmentStatus.findFirst(),
  ]);
  assert.ok(permission && type && region && status && language && gender && studentStatus && stage && grade && classType && composition && enrollmentStatus, 'Required global fixtures are missing');

  const marker = `phase7b2-${Date.now()}`;
  const institutionA = await prisma.institution.create({ data: { schoolCode: String(Date.now()).slice(-10), slug: `${marker}-a`, nameAr: 'Phase 7B-2 Institution A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const yearA = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-a`, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30'), isCurrent: false } });
  const classA = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 96, classCode: `${grade.codeNumber}-96`, nameAr: 'Phase 7B-2 A', typeId: classType.id, compositionId: composition.id } });
  const baseStaffA = await prisma.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: 'Phase', familyNameAr: 'Base A' } });
  const baseUserA = await prisma.user.create({ data: { email: `${marker}-base@test.local`, normalizedEmail: `${marker}-base@test.local`, passwordHash: 'fixture', isActive: true } });
  const memberA = await prisma.institutionUser.create({ data: { institutionId: institutionA.id, userId: baseUserA.id, staffMemberId: baseStaffA.id, isActive: true } });
  const institutionB = await prisma.institution.create({
    data: {
      schoolCode: String(Date.now()).slice(-10), slug: marker, nameAr: 'Phase 7B-2 Fixture',
      typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id,
    },
  });
  const yearA2 = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: marker, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30') } });
  const yearB = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: marker, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30') } });
  const classA2 = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA2.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 97, classCode: `${grade.codeNumber}-97`, nameAr: 'Phase 7B-2 A2', typeId: classType.id, compositionId: composition.id } });
  const classB = await prisma.class.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 98, classCode: `${grade.codeNumber}-98`, nameAr: 'Phase 7B-2 B', typeId: classType.id, compositionId: composition.id } });
  const staffA = await prisma.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: 'Phase', familyNameAr: 'Staff A' } });
  const staffARole = await prisma.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: 'Phase', familyNameAr: 'Staff A Role' } });
  const staffB = await prisma.staffMember.create({ data: { institutionId: institutionB.id, firstNameAr: 'Phase', familyNameAr: 'Staff B' } });
  const roleA = await prisma.jobRole.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-role-a` } });
  const roleB = await prisma.jobRole.create({ data: { institutionId: institutionB.id, nameAr: `${marker}-role-b` } });
  const appRoleA = await prisma.role.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-app-a` } });
  const appRoleB = await prisma.role.create({ data: { institutionId: institutionB.id, nameAr: `${marker}-app-b` } });
  const studentA = await prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `90${String(Date.now()).slice(-8)}`, studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase', lastNameAr: 'Student A' } });
  const studentAClass = await prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `92${String(Date.now() + 1).slice(-8)}`, studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase', lastNameAr: 'Student A Class' } });
  const studentAYear = await prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `93${String(Date.now() + 2).slice(-8)}`, studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase', lastNameAr: 'Student A Year' } });
  const studentB = await prisma.student.create({ data: { institutionId: institutionB.id, nationalId: `91${String(Date.now()).slice(-8)}`, studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase', lastNameAr: 'Student B' } });
  let enrollmentId: string | undefined;
  let assignmentId: string | undefined;
  let userRoleId: string | undefined;
  let permissionId: string | undefined;

  try {
    const enrollment = await prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, studentId: studentA.id, classId: classA.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date('2027-09-01') } });
    enrollmentId = enrollment.id;
    await expectForeignKeyViolation(prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, studentId: studentB.id, classId: classA.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date() } }), 'Cross-institution student enrollment must be blocked');
    await expectForeignKeyViolation(prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearB.id, studentId: studentA.id, classId: classA.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date() } }), 'Cross-institution academic year enrollment must be blocked');
    await expectForeignKeyViolation(prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, studentId: studentAClass.id, classId: classB.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date() } }), 'Cross-institution class enrollment must be blocked');
    await expectForeignKeyViolation(prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, studentId: studentAYear.id, classId: classA2.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date() } }), 'Same-institution wrong-year class enrollment must be blocked');

    const assignment = await prisma.staffAssignment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, staffMemberId: staffA.id, jobRoleId: roleA.id, startDate: new Date('2027-09-01') } });
    assignmentId = assignment.id;
    await expectForeignKeyViolation(prisma.staffAssignment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, staffMemberId: staffB.id, jobRoleId: roleA.id, startDate: new Date() } }), 'Cross-institution staff assignment must be blocked');
    await expectForeignKeyViolation(prisma.staffAssignment.create({ data: { institutionId: institutionA.id, academicYearId: yearB.id, staffMemberId: staffA.id, jobRoleId: roleA.id, startDate: new Date() } }), 'Cross-institution staff year assignment must be blocked');
    await expectForeignKeyViolation(prisma.staffAssignment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, staffMemberId: staffARole.id, jobRoleId: roleB.id, startDate: new Date() } }), 'Cross-institution job role assignment must be blocked');

    const userRole = await prisma.institutionUserRole.create({ data: { institutionId: institutionA.id, institutionUserId: memberA.id, roleId: appRoleA.id } });
    userRoleId = userRole.id;
    await expectForeignKeyViolation(prisma.institutionUserRole.create({ data: { institutionId: institutionA.id, institutionUserId: memberA.id, roleId: appRoleB.id } }), 'Cross-institution application role assignment must be blocked');

    const rolePermission = await prisma.rolePermission.create({ data: { institutionId: institutionA.id, roleId: appRoleA.id, permissionId: permission.id } });
    permissionId = rolePermission.id;
    await expectForeignKeyViolation(prisma.rolePermission.create({ data: { institutionId: institutionA.id, roleId: appRoleB.id, permissionId: permission.id } }), 'Cross-institution role permission must be blocked');
  } finally {
    if (permissionId) await prisma.rolePermission.delete({ where: { id: permissionId } });
    if (userRoleId) await prisma.institutionUserRole.delete({ where: { id: userRoleId } });
    if (assignmentId) await prisma.staffAssignment.delete({ where: { id: assignmentId } });
    if (enrollmentId) await prisma.studentEnrollment.delete({ where: { id: enrollmentId } });
    await prisma.student.deleteMany({ where: { id: { in: [studentA.id, studentAClass.id, studentAYear.id, studentB.id] } } });
    await prisma.role.deleteMany({ where: { id: { in: [appRoleA.id, appRoleB.id] } } });
    await prisma.jobRole.deleteMany({ where: { id: { in: [roleA.id, roleB.id] } } });
    await prisma.staffMember.deleteMany({ where: { id: { in: [staffA.id, staffARole.id, staffB.id] } } });
    await prisma.class.deleteMany({ where: { id: { in: [classA2.id, classB.id] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [yearA2.id, yearB.id] } } });
    await prisma.institution.delete({ where: { id: institutionB.id } });
    await prisma.institutionUserRole.deleteMany({ where: { institutionId: institutionA.id } });
    await prisma.institutionUser.delete({ where: { id: memberA.id } });
    await prisma.user.delete({ where: { id: baseUserA.id } });
    await prisma.staffMember.delete({ where: { id: baseStaffA.id } });
    await prisma.class.delete({ where: { id: classA.id } });
    await prisma.academicYear.delete({ where: { id: yearA.id } });
    await prisma.institution.delete({ where: { id: institutionA.id } });
  }
  console.log('Phase 7B-2 database integrity tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
