import { strict as assert } from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';

function isConstraintError(error: any): boolean {
  return ['P2002', 'P2003'].includes(error?.code) || /unique|foreign key/i.test(String(error?.message || ''));
}

async function main() {
  const [type, region, institutionStatus, language, studentStatus, gender, stage, grade, classType, composition, enrollmentStatus] = await Promise.all([
    prisma.educationType.findFirst(), prisma.region.findFirst(), prisma.institutionStatus.findFirst(), prisma.language.findFirst(),
    prisma.studentStatus.findFirst(), prisma.gender.findFirst(), prisma.educationStage.findFirst(), prisma.gradeLevel.findFirst(),
    prisma.classType.findFirst(), prisma.compositionType.findFirst(), prisma.enrollmentStatus.findFirst(),
  ]);
  assert.ok(type && region && institutionStatus && language && studentStatus && gender && stage && grade && classType && composition && enrollmentStatus, 'Global lookup fixtures are required');

  const marker = `phase8b-${Date.now()}`;
  const institutionA = await prisma.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`, nameAr: 'Phase 8B A', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
  const institutionB = await prisma.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`, nameAr: 'Phase 8B B', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
  const yearA = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-A`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const yearB = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `${marker}-B`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
  const classA = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 91, classCode: `${grade.codeNumber}-91`, nameAr: 'Phase 8B A', typeId: classType.id, compositionId: composition.id } });
  const classB = await prisma.class.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 92, classCode: `${grade.codeNumber}-92`, nameAr: 'Phase 8B B', typeId: classType.id, compositionId: composition.id } });
  const studentA = await prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `${Date.now()}`.slice(-10), studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase 8B', lastNameAr: 'Student A' } });
  const studentB = await prisma.student.create({ data: { institutionId: institutionB.id, nationalId: `${Date.now() + 1}`.slice(-10), studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase 8B', lastNameAr: 'Student B' } });
  const enrollmentA = await prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, studentId: studentA.id, classId: classA.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date('2099-09-01') } });
  const enrollmentB = await prisma.studentEnrollment.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, studentId: studentB.id, classId: classB.id, enrollmentStatusId: enrollmentStatus.id, startDate: new Date('2099-09-01') } });
  const date = new Date('2099-08-17T00:00:00.000Z');
  let attendanceA: string | undefined;
  let attendanceB: string | undefined;

  try {
    const created = await prisma.attendance.create({ data: { institutionId: institutionA.id, studentEnrollmentId: enrollmentA.id, attendanceDate: date, status: 'PRESENT', notes: 'phase8b' } });
    attendanceA = created.id;
    const createdB = await prisma.attendance.create({ data: { institutionId: institutionB.id, studentEnrollmentId: enrollmentB.id, attendanceDate: date, status: 'ABSENT' } });
    attendanceB = createdB.id;
    assert.equal(created.status, 'PRESENT', 'Create attendance must persist the status');

    try {
      await prisma.attendance.create({ data: { institutionId: institutionA.id, studentEnrollmentId: enrollmentA.id, attendanceDate: date, status: 'ABSENT' } });
      assert.fail('Duplicate attendance must be blocked');
    } catch (error) { assert.ok(isConstraintError(error), 'Duplicate attendance must return a unique violation'); }

    const updated = await prisma.attendance.update({ where: { id: created.id }, data: { status: 'LATE' } });
    assert.equal(updated.status, 'LATE', 'Update attendance must persist the new status');
    try {
      await prisma.attendance.create({ data: { institutionId: institutionA.id, studentEnrollmentId: enrollmentB.id, attendanceDate: new Date('2099-08-18T00:00:00.000Z'), status: 'PRESENT' } });
      assert.fail('Cross-institution enrollment must be blocked');
    } catch (error) { assert.ok(isConstraintError(error), 'Cross-institution enrollment must return a constraint violation'); }

    const [table, role, policies] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'student_attendance'::regclass`),
      prisma.$queryRawUnsafe<any[]>(`select rolbypassrls from pg_roles where rolname = 'school_app'`),
      prisma.$queryRawUnsafe<any[]>(`select policyname from pg_policies where tablename = 'student_attendance'`),
    ]);
    assert.equal(table[0]?.relrowsecurity, true, 'Attendance RLS must be enabled');
    assert.equal(table[0]?.relforcerowsecurity, true, 'Attendance RLS must be forced');
    assert.equal(role[0]?.rolbypassrls, false, 'school_app must not bypass RLS');
    assert.ok(policies.some((policy) => policy.policyname === 'student_attendance_rls_policy'), 'Attendance RLS policy must exist');

    const runtimeUrl = process.env['ATTENDANCE_RUNTIME_DATABASE_URL'];
    if (runtimeUrl) {
      const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
      try {
        const missingContext = await runtime.attendance.findMany();
        assert.equal(missingContext.length, 0, 'Missing RLS context must return no attendance records');
        const institutionARecords = await runtime.$transaction(async (tx) => {
          await tx.$executeRaw`select set_config('app.current_institution_id', ${institutionA.id}, true)`;
          return tx.attendance.findMany({ orderBy: { attendanceDate: 'asc' } });
        });
        assert.ok(institutionARecords.some((record) => record.id === attendanceA), 'Institution A context must see A attendance');
        assert.ok(!institutionARecords.some((record) => record.id === attendanceB), 'Institution A context must not see B attendance');
      } finally { await runtime.$disconnect(); }
    } else {
      console.log('Runtime RLS visibility checks skipped: ATTENDANCE_RUNTIME_DATABASE_URL was not provided.');
    }

    await prisma.attendance.delete({ where: { id: attendanceA } });
    attendanceA = undefined;
    assert.equal(await prisma.attendance.findUnique({ where: { id: created.id } }), null, 'Delete attendance must remove the record');
  } finally {
    if (attendanceA) await prisma.attendance.delete({ where: { id: attendanceA } }).catch(() => undefined);
    if (attendanceB) await prisma.attendance.delete({ where: { id: attendanceB } }).catch(() => undefined);
    await prisma.studentEnrollment.deleteMany({ where: { id: { in: [enrollmentA.id, enrollmentB.id] } } });
    await prisma.student.deleteMany({ where: { id: { in: [studentA.id, studentB.id] } } });
    await prisma.class.deleteMany({ where: { id: { in: [classA.id, classB.id] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [yearA.id, yearB.id] } } });
    await prisma.institution.deleteMany({ where: { id: { in: [institutionA.id, institutionB.id] } } });
  }
  console.log('Phase 8B attendance CRUD, cross-institution, and RLS tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
