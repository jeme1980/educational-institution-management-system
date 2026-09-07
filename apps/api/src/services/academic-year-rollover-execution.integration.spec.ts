import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { executeAcademicYearRollover, executionPlanFingerprint, fingerprintInput, loadRolloverExecutionState, RolloverExecutionError } from './academic-year-rollover-execution.service';

const enabled = process.env['RUN_ROLLOVER_INTEGRATION'] === '1';
const institutionId = '00000000-0000-4000-8000-000000000001';
const client = new PrismaClient({ datasources: { db: { url: process.env['RLS_RUNTIME_DATABASE_URL'] || process.env['DATABASE_URL'] } } });
const cleanupClient = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] } } });

async function tenantTransaction<T>(callback: (tx: any) => Promise<T>) {
  return client.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_institution_id', $1, true)`, institutionId);
    return callback(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function createFixture(suffix: string) {
  return tenantTransaction(async tx => {
    const [templateClass, student, status] = await Promise.all([
      tx.class.findFirstOrThrow({ where: { institutionId, archivedAt: null }, orderBy: { id: 'asc' } }),
      tx.student.findFirstOrThrow({ where: { institutionId, isActive: true }, orderBy: { id: 'asc' } }),
      tx.enrollmentStatus.findFirstOrThrow({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    ]);
    const sourceYearId = randomUUID(); const targetYearId = randomUUID(); const rolloverId = randomUUID();
    const sourceStart = new Date('2090-09-01T00:00:00.000Z'); const targetStart = new Date('2091-09-01T00:00:00.000Z');
    await tx.academicYear.createMany({ data: [
      { id: sourceYearId, institutionId, yearLabel: `IT-${suffix}-S`, startDate: sourceStart, endDate: new Date('2091-06-30T00:00:00.000Z'), isCurrent: false, isClosed: true },
      { id: targetYearId, institutionId, yearLabel: `IT-${suffix}-T`, startDate: targetStart, endDate: new Date('2092-06-30T00:00:00.000Z'), isCurrent: false, isClosed: false },
    ] });
    await tx.academicPeriod.create({ data: { institutionId, academicYearId: targetYearId, nameAr: 'الفترة التجريبية', startDate: targetStart, endDate: new Date('2091-12-31T00:00:00.000Z'), sortOrder: 1, isActive: true } });
    const sourceClass = await tx.class.create({ data: { institutionId, academicYearId: sourceYearId, stageId: templateClass.stageId, gradeLevelId: templateClass.gradeLevelId, parallelNumber: 97, classCode: `IT-${suffix}`, nameAr: 'شعبة المصدر التجريبية', typeId: templateClass.typeId, compositionId: templateClass.compositionId } });
    const sourceEnrollment = await tx.studentEnrollment.create({ data: { institutionId, academicYearId: sourceYearId, studentId: student.id, classId: sourceClass.id, enrollmentStatusId: status.id, startDate: sourceStart, endDate: null, isActive: true } });
    const sourceSubject = await tx.subject.create({ data: { institutionId, academicYearId: sourceYearId, nameAr: `مادة تكامل ${suffix}`, nameHe: null, isActive: true } });
    await tx.topic.create({ data: { institutionId, academicYearId: sourceYearId, subjectId: sourceSubject.id, gradeLevelId: sourceClass.gradeLevelId, nameAr: 'موضوع تكامل', nameHe: null, isActive: true } });
    await tx.skill.create({ data: { institutionId, academicYearId: sourceYearId, subjectId: sourceSubject.id, gradeLevelId: sourceClass.gradeLevelId, nameAr: 'مهارة تكامل', nameHe: null, isActive: true } });
    await tx.academicYearRollover.create({ data: { id: rolloverId, institutionId, sourceAcademicYearId: sourceYearId, targetAcademicYearId: targetYearId, status: 'DRAFT' } });
    const mapping = await tx.academicYearRolloverClassMapping.create({ data: { institutionId, rolloverId, sourceClassId: sourceClass.id, action: 'CREATE', validationStatus: 'VALID', targetStageId: sourceClass.stageId, targetGradeLevelId: sourceClass.gradeLevelId, targetParallelNumber: 97, targetNameAr: 'شعبة الهدف التجريبية' } });
    await tx.studentRolloverDecision.create({ data: { institutionId, rolloverId, studentId: student.id, sourceEnrollmentId: sourceEnrollment.id, action: 'PROMOTE', targetGradeLevelId: sourceClass.gradeLevelId, targetAcademicYearId: targetYearId, targetClassMappingId: mapping.id, validationStatus: 'VALID', warnings: [] } });
    return { rolloverId, sourceYearId, targetYearId, sourceClassId: sourceClass.id, sourceSubjectId: sourceSubject.id, sourceEnrollmentId: sourceEnrollment.id };
  });
}

async function cleanup(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await cleanupClient.$transaction(async tx => {
    await tx.auditLog.deleteMany({ where: { institutionId, entityId: fixture.rolloverId } });
    await tx.academicYearRollover.deleteMany({ where: { institutionId, id: fixture.rolloverId } });
    await tx.studentEnrollment.deleteMany({ where: { institutionId, academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
    await tx.topic.deleteMany({ where: { institutionId, academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
    await tx.skill.deleteMany({ where: { institutionId, academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
    await tx.staffAssignmentSubject.deleteMany({ where: { institutionId, staffAssignment: { academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } } });
    await tx.staffAssignment.deleteMany({ where: { institutionId, academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
    await tx.academicYearSpecialization.deleteMany({ where: { institutionId, academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
    await tx.subject.deleteMany({ where: { institutionId, academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
    await tx.class.deleteMany({ where: { institutionId, academicYearId: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
    await tx.academicPeriod.deleteMany({ where: { institutionId, academicYearId: fixture.targetYearId } });
    await tx.academicYear.deleteMany({ where: { institutionId, id: { in: [fixture.sourceYearId, fixture.targetYearId] } } });
  });
}

test('successful execute, completed retry, and concurrent execute create one target set', { skip: !enabled }, async () => {
  const fixture = await createFixture(randomUUID().slice(0, 8));
  try {
    const fingerprint = await tenantTransaction(async tx => executionPlanFingerprint(fingerprintInput(await loadRolloverExecutionState(tx, institutionId, fixture.rolloverId))));
    await assert.rejects(() => tenantTransaction(tx => executeAcademicYearRollover(randomUUID(), fixture.rolloverId, fingerprint, undefined, { db: tx })), (error: any) => error?.code === 'ROLLOVER_NOT_FOUND');
    const run = () => tenantTransaction(tx => executeAcademicYearRollover(institutionId, fixture.rolloverId, fingerprint, undefined, { db: tx }));
    const concurrent = await Promise.allSettled([run(), run()]);
    assert.equal(concurrent.filter(item => item.status === 'fulfilled').length >= 1, true);
    const rejected = concurrent.find(item => item.status === 'rejected') as PromiseRejectedResult | undefined;
    if (rejected) assert.equal((rejected.reason as RolloverExecutionError).code, 'ROLLOVER_EXECUTION_IN_PROGRESS');
    const retry = await run(); assert.equal(retry.alreadyCompleted, true);
    await tenantTransaction(async tx => {
      const [operation, classes, subjects, topics, skills, enrollments, maps, sourceClass, sourceSubject, sourceEnrollment] = await Promise.all([
        tx.academicYearRollover.findUnique({ where: { id: fixture.rolloverId } }), tx.class.count({ where: { institutionId, academicYearId: fixture.targetYearId } }), tx.subject.count({ where: { institutionId, academicYearId: fixture.targetYearId } }), tx.topic.count({ where: { institutionId, academicYearId: fixture.targetYearId } }), tx.skill.count({ where: { institutionId, academicYearId: fixture.targetYearId } }), tx.studentEnrollment.count({ where: { institutionId, academicYearId: fixture.targetYearId } }), tx.academicYearRolloverEntityMap.count({ where: { institutionId, rolloverId: fixture.rolloverId } }), tx.class.findUnique({ where: { id: fixture.sourceClassId } }), tx.subject.findUnique({ where: { id: fixture.sourceSubjectId } }), tx.studentEnrollment.findUnique({ where: { id: fixture.sourceEnrollmentId } }),
      ]);
      assert.equal(operation.status, 'COMPLETED'); assert.deepEqual({ classes, subjects, topics, skills, enrollments, maps }, { classes: 1, subjects: 1, topics: 1, skills: 1, enrollments: 1, maps: 5 });
      assert.ok(sourceClass); assert.ok(sourceSubject); assert.ok(sourceEnrollment);
    });
  } finally { await cleanup(fixture); }
});

test('injected midway failure rolls back target rows, maps, decision refs, and RUNNING status', { skip: !enabled }, async () => {
  const fixture = await createFixture(randomUUID().slice(0, 8));
  try {
    const fingerprint = await tenantTransaction(async tx => executionPlanFingerprint(fingerprintInput(await loadRolloverExecutionState(tx, institutionId, fixture.rolloverId))));
    await assert.rejects(() => tenantTransaction(tx => executeAcademicYearRollover(institutionId, fixture.rolloverId, fingerprint, undefined, { db: tx, failAfterSubjects: true })), /INJECTED_ROLLOVER_FAILURE/);
    await tenantTransaction(async tx => {
      const [operation, classes, subjects, maps, decision] = await Promise.all([tx.academicYearRollover.findUnique({ where: { id: fixture.rolloverId } }), tx.class.count({ where: { institutionId, academicYearId: fixture.targetYearId } }), tx.subject.count({ where: { institutionId, academicYearId: fixture.targetYearId } }), tx.academicYearRolloverEntityMap.count({ where: { institutionId, rolloverId: fixture.rolloverId } }), tx.studentRolloverDecision.findFirst({ where: { institutionId, rolloverId: fixture.rolloverId } })]);
      assert.equal(operation.status, 'DRAFT'); assert.equal(classes, 0); assert.equal(subjects, 0); assert.equal(maps, 0); assert.equal(decision.targetEnrollmentId, null);
    });
  } finally { await cleanup(fixture); }
});

test.after(async () => { await client.$disconnect(); await cleanupClient.$disconnect(); });
