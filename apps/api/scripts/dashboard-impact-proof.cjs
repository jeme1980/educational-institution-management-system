// Read-only proof against the built service. Supply explicit institution/year IDs.
// node apps/api/scripts/dashboard-impact-proof.cjs <institutionId> <academicYearId> [dimensionId ...]
const assert = require('node:assert/strict');
const { prisma, runWithRequestTransaction } = require('../dist/db/prisma');
const { academicAnalytics } = require('../dist/services/dashboard.service');

async function main() {
  const [institutionId, academicYearId, ...traceIds] = process.argv.slice(2);
  assert.ok(institutionId && academicYearId, 'Explicit institution and academic year required');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const [role] = await tx.$queryRawUnsafe('SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    assert.equal(role.current_user, 'school_app');
    assert.equal(role.rolbypassrls, false);
    await tx.$executeRawUnsafe("SELECT set_config('app.current_institution_id', $1, true)", institutionId);
    await runWithRequestTransaction(tx, async () => {
      const year = await prisma.academicYear.findFirstOrThrow({ where: { id: academicYearId, institutionId, archivedAt: null } });
      const dto = await academicAnalytics(institutionId, academicYearId);
      // Independent relational aggregation, without study-group or result/score expansion.
      const rows = await tx.$queryRawUnsafe(`
        SELECT d.id, d.name, d.kind, SUM(s.score)::float8 AS earned,
          SUM(q."maxScore")::float8 AS possible, COUNT(*)::int AS observations,
          COUNT(DISTINCT s."studentId")::int AS students,
          ROUND(SUM(s.score) / SUM(q."maxScore") * 100, 2)::float8 AS expected
        FROM exams e
        JOIN exam_questions q ON q."examId" = e.id AND q."institutionId" = e."institutionId"
        JOIN student_question_scores s ON s."examQuestionId" = q.id AND s."institutionId" = e."institutionId"
        JOIN student_exam_results r ON r."examId" = e.id AND r."studentId" = s."studentId" AND r."institutionId" = e."institutionId" AND NOT r."isAbsence"
        CROSS JOIN LATERAL (
          SELECT id, "nameAr" AS name, 'skill' AS kind FROM skills
          WHERE id = q."skillId" AND "institutionId" = e."institutionId" AND "academicYearId" = e."academicYearId"
          UNION ALL
          SELECT id, "nameAr", 'topic' FROM topics
          WHERE id = q."topicId" AND "institutionId" = e."institutionId" AND "academicYearId" = e."academicYearId"
        ) d
        WHERE e."institutionId" = $1::uuid AND e."academicYearId" = $2::uuid
          AND e."archivedAt" IS NULL AND q."maxScore" > 0 AND s.score IS NOT NULL
        GROUP BY d.id, d.name, d.kind`, institutionId, academicYearId);
      rows.sort((a, b) => b.expected - a.expected || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
      assert.deepEqual(dto.skillPerformance, rows.slice(0, 12).map(row => ({
        id: row.id, label: row.name, kind: row.kind, average: row.expected, count: row.observations,
      })));
      const [counts] = await tx.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS active,
          COUNT(*) FILTER (WHERE e."examDate" < NOW() AND EXISTS (
            SELECT 1 FROM student_exam_results r WHERE r."examId" = e.id AND r."institutionId" = e."institutionId"
          ))::int AS completed,
          COUNT(*) FILTER (WHERE NOT e."isPublished")::int AS unpublished,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM exam_study_groups g WHERE g."examId" = e.id) > 1)::int AS "multipleGroups"
        FROM exams e WHERE e."institutionId" = $1::uuid AND e."academicYearId" = $2::uuid AND e."archivedAt" IS NULL`, institutionId, academicYearId);
      assert.equal(dto.examStatus.find(row => row.id === 'completed')?.count || 0, counts.completed);
      // RLS must hide foreign exams even without an institution predicate in the service.
      assert.equal(await tx.exam.count({ where: { institutionId: { not: institutionId } } }), 0);
      const years = await tx.academicYear.findMany({ where: { institutionId, archivedAt: null }, select: { id: true, yearLabel: true } });
      const yearCounts = [];
      for (const candidate of years) {
        const data = await academicAnalytics(institutionId, candidate.id);
        const count = await tx.exam.count({ where: { institutionId, academicYearId: candidate.id, archivedAt: null } });
        assert.equal(data.examStatus.reduce((sum, item) => sum + item.count, 0), count);
        yearCounts.push({ year: candidate.yearLabel, exams: count, dimensions: data.skillPerformance.length });
      }
      console.log(JSON.stringify({ role, institutionId, year: year.yearLabel, counts, yearCounts,
        proof: rows.filter((row, index) => index < 5 || traceIds.includes(row.id)).map(row => ({
          ...row, rank: rows.indexOf(row) + 1,
          after: dto.skillPerformance.find(item => item.id === row.id && item.kind === row.kind)?.average ?? 'outside top 12',
        })),
        visible: dto.skillPerformance.slice(0, 5), result: 'PASS',
      }, null, 2));
    });
  }, { timeout: 30000 });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
