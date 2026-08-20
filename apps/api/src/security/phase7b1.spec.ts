import { strict as assert } from 'node:assert';
import crypto from 'node:crypto';
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
    assert.ok(isForeignKeyViolation(error), `${message}: expected a PostgreSQL foreign-key violation`);
  }
}

async function main() {
  const [institutionA, exam, question, type, region, status, language, gender, studentStatus] = await Promise.all([
    prisma.institution.findFirst({ select: { id: true } }),
    prisma.exam.findFirst({ select: { id: true } }),
    prisma.examQuestion.findFirst({ select: { id: true } }),
    prisma.educationType.findFirst(),
    prisma.region.findFirst(),
    prisma.institutionStatus.findFirst(),
    prisma.language.findFirst(),
    prisma.gender.findFirst(),
    prisma.studentStatus.findFirst(),
  ]);
  assert.ok(institutionA && exam && question && type && region && status && language && gender && studentStatus, 'Required fixtures are missing');

  const orphanResultCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM student_exam_results r
    LEFT JOIN students s ON s.id = r."studentId"
    WHERE s.id IS NULL
  `;
  const orphanScoreCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM student_question_scores q
    LEFT JOIN students s ON s.id = q."studentId"
    WHERE s.id IS NULL
  `;
  const crossResultCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM student_exam_results r
    JOIN students s ON s.id = r."studentId"
    WHERE r."institutionId" <> s."institutionId"
  `;
  const crossScoreCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM student_question_scores q
    JOIN students s ON s.id = q."studentId"
    WHERE q."institutionId" <> s."institutionId"
  `;
  assert.equal(Number(orphanResultCount[0].count), 0, 'Preflight found orphan exam results');
  assert.equal(Number(orphanScoreCount[0].count), 0, 'Preflight found orphan question scores');
  assert.equal(Number(crossResultCount[0].count), 0, 'Preflight found cross-institution exam results');
  assert.equal(Number(crossScoreCount[0].count), 0, 'Preflight found cross-institution question scores');

  const marker = `phase7b1-${Date.now()}`;
  const institutionB = await prisma.institution.create({
    data: {
      schoolCode: String(Date.now()).slice(-10),
      slug: marker,
      nameAr: 'Phase 7B-1 Fixture',
      typeId: type.id,
      regionId: region.id,
      statusId: status.id,
      defaultLanguageId: language.id,
    },
  });
  const studentA = await prisma.student.create({
    data: {
      institutionId: institutionA.id,
      nationalId: String(Date.now()).slice(-10),
      studentStatusId: studentStatus.id,
      genderId: gender.id,
      firstNameAr: 'Phase',
      lastNameAr: 'Student A',
    },
  });
  const studentB = await prisma.student.create({
    data: {
      institutionId: institutionB.id,
      nationalId: String(Date.now() + 1).slice(-10),
      studentStatusId: studentStatus.id,
      genderId: gender.id,
      firstNameAr: 'Phase',
      lastNameAr: 'Student B',
    },
  });
  const orphanStudentId = crypto.randomUUID();
  const orphanScoreStudentId = crypto.randomUUID();
  let resultId: string | undefined;
  let scoreId: string | undefined;

  try {
    const validResult = await prisma.studentExamResult.create({ data: { institutionId: institutionA.id, examId: exam.id, studentId: studentA.id, totalScore: 1 } });
    resultId = validResult.id;
    const validScore = await prisma.studentQuestionScore.create({ data: { institutionId: institutionA.id, examQuestionId: question.id, studentId: studentA.id, score: 1 } });
    scoreId = validScore.id;

    await expectForeignKeyViolation(
      prisma.studentExamResult.create({ data: { institutionId: institutionA.id, examId: exam.id, studentId: orphanStudentId, totalScore: 0 } }),
      'Orphan StudentExamResult must be rejected',
    );
    await expectForeignKeyViolation(
      prisma.studentExamResult.create({ data: { institutionId: institutionA.id, examId: exam.id, studentId: studentB.id, totalScore: 0 } }),
      'Cross-institution StudentExamResult must be rejected',
    );
    await expectForeignKeyViolation(
      prisma.studentQuestionScore.create({ data: { institutionId: institutionA.id, examQuestionId: question.id, studentId: orphanScoreStudentId, score: 0 } }),
      'Orphan StudentQuestionScore must be rejected',
    );
    await expectForeignKeyViolation(
      prisma.studentQuestionScore.create({ data: { institutionId: institutionA.id, examQuestionId: question.id, studentId: studentB.id, score: 0 } }),
      'Cross-institution StudentQuestionScore must be rejected',
    );
    await expectForeignKeyViolation(prisma.student.delete({ where: { id: studentA.id } }), 'Students with historical results/scores must not be hard-deleted');
  } finally {
    if (scoreId) await prisma.studentQuestionScore.delete({ where: { id: scoreId } });
    if (resultId) await prisma.studentExamResult.delete({ where: { id: resultId } });
    await prisma.student.deleteMany({ where: { id: { in: [studentA.id, studentB.id] } } });
    await prisma.institution.delete({ where: { id: institutionB.id } });
  }

  console.log('Phase 7B-1 database integrity tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
