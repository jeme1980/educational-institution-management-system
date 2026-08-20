import { strict as assert } from 'node:assert';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { getExamsByIdResultsEnhanced } from '../controllers/exams.controller';
import { withRlsContext } from '../middleware/rls-request.middleware';

function response() {
  let status = 200; let body: any;
  const res: any = { status(code: number) { status = code; return res; }, json(value: any) { body = value; return res; } };
  return { res, get status() { return status; }, get body() { return body; } };
}

async function main() {
  const exam = await prisma.exam.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' } });
  assert.ok(exam, 'An exam fixture is required for phase 8E result tests');
  const linkedStudents = await prisma.examStudyGroup.findMany({ where: { examId: exam.id, institutionId: exam.institutionId }, select: { studyGroup: { select: { students: { select: { studentEnrollment: { select: { studentId: true } } } } } } } });
  const eligible = new Set(linkedStudents.flatMap(link => link.studyGroup.students.map(item => item.studentEnrollment.studentId)));
  const resultRows = await prisma.studentExamResult.findMany({ where: { examId: exam.id, institutionId: exam.institutionId } });
  assert.ok(resultRows.every(row => eligible.has(row.studentId)), 'Stored results must belong to eligible exam students');
  const questionIds = (await prisma.examQuestion.findMany({ where: { examId: exam.id, institutionId: exam.institutionId }, select: { id: true, maxScore: true } }));
  const scores = await prisma.studentQuestionScore.findMany({ where: { institutionId: exam.institutionId, examQuestionId: { in: questionIds.map(q => q.id) } } });
  const limits = new Map(questionIds.map(q => [q.id, Number(q.maxScore)]));
  assert.ok(scores.every(score => Number(score.score) >= 0 && Number(score.score) <= (limits.get(score.examQuestionId) ?? -1)), 'Question scores must stay within question limits');
  assert.ok(resultRows.every(row => Number(row.totalScore) >= 0 && Number(row.totalScore) <= Number(exam.maxScore)), 'Result totals must stay within exam limits');
  const view = response();
  await withRlsContext(exam.institutionId, () => getExamsByIdResultsEnhanced({ context: { institutionId: exam.institutionId, academicYearId: exam.academicYearId }, params: { id: exam.id } } as any, view.res));
  assert.equal(view.status, 200);
  assert.ok(Array.isArray(view.body.results));
  assert.ok(view.body.results.every((row: any) => ['ABSENT', 'NOT_ENTERED', 'PASS', 'FAIL'].includes(row.status)), 'Result status must be derived from persisted result data');
  const duplicateResults = await prisma.$queryRawUnsafe<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM (SELECT "examId", "studentId", COUNT(*) FROM "student_exam_results" GROUP BY "examId", "studentId" HAVING COUNT(*) > 1) duplicates');
  const duplicateScores = await prisma.$queryRawUnsafe<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM (SELECT "examQuestionId", "studentId", COUNT(*) FROM "student_question_scores" GROUP BY "examQuestionId", "studentId" HAVING COUNT(*) > 1) duplicates');
  assert.equal(duplicateResults[0].n, 0); assert.equal(duplicateScores[0].n, 0);
  const constraints = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT conname AS name FROM pg_constraint WHERE conname IN ('student_question_scores_score_nonnegative', 'student_exam_results_total_score_nonnegative')`);
  assert.equal(constraints.length, 2, 'Score integrity constraints must be installed');
  console.log('Phase 8E exam results integrity and real-data analysis tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
