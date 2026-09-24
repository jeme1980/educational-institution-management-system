import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { runWithRequestTransaction } from '../db/prisma';
import { academicAnalytics } from './dashboard.service';

const db = { exam: { findMany: async () => [] } };
const scopedAnalytics = (institution: string, year: string) => runWithRequestTransaction(
  db as unknown as Prisma.TransactionClient, () => academicAnalytics(institution, year),
);

const institutionId = 'institution-a';
const academicYearId = '2025-2026';
const dimension = (id: string) => ({ id, nameAr: id, institutionId, academicYearId });
const question = (id: string, maxScore: number, score: number | null) => ({
  id, maxScore, skill: dimension('skill-a'), topic: dimension('topic-a'),
  studentScores: [{ studentId: 'present', score }],
});
const exam = () => ({
  id: 'exam-a', institutionId, academicYearId, archivedAt: null, isPublished: false,
  examDate: new Date('2020-01-01'), subject: { id: 'subject', nameAr: 'Subject' },
  examGroups: [{ studyGroupId: 'group-a' }, { studyGroupId: 'group-b' }],
  studentExamResults: [{ studentId: 'present', totalScore: 6, isAbsence: false }],
  examQuestions: [question('q1', 2, 2), question('q2', 8, 4)],
});

test('weighted skill and direct topic performance use scored observations once across multiple groups', async (t) => {
  t.mock.method(db.exam, 'findMany', async (args: { select: Record<string, unknown> }) => {
    assert.equal(args.select['examGroups'], undefined);
    return [exam()];
  });
  const result = await scopedAnalytics(institutionId, academicYearId);
  assert.deepEqual(result.skillPerformance, [
    { id: 'skill-a', label: 'skill-a', kind: 'skill', average: 60, count: 2 },
    { id: 'topic-a', label: 'topic-a', kind: 'topic', average: 60, count: 2 },
  ]);
  assert.deepEqual(result.examStatus, [{ id: 'completed', label: 'مكتملة', count: 1 }]);
});

test('present zero counts; absence, missing result, null and missing scores do not', async (t) => {
  const row = exam();
  row.studentExamResults.push({ studentId: 'absent', totalScore: 0, isAbsence: true });
  row.examQuestions = [question('zero', 2, 0), question('partial', 8, 4), question('null', 10, null)];
  row.examQuestions[0].studentScores.push({ studentId: 'absent', score: 2 }, { studentId: 'no-result', score: 2 });
  row.examQuestions.push({ ...question('missing', 100, 0), studentScores: [] });
  t.mock.method(db.exam, 'findMany', async () => [row]);
  const result = await scopedAnalytics(institutionId, academicYearId);
  for (const item of result.skillPerformance) {
    assert.equal(item.average, 40); // (0 + 4) / (2 + 8), not 4 / 8 or 4 / 120.
    assert.equal(item.count, 2);
  }
});

test('exam query isolates tenant/year/archive; completion preserves date + result contract regardless of publication', async (t) => {
  const rows = [exam(), { ...exam(), id: 'no-results', studentExamResults: [] },
    { ...exam(), id: 'future', examDate: new Date('2999-01-01') },
    { ...exam(), id: 'other-year', academicYearId: '2026-2027' },
    { ...exam(), id: 'other-tenant', institutionId: 'institution-b' },
    { ...exam(), id: 'archived', archivedAt: new Date() }];
  t.mock.method(db.exam, 'findMany', async (args: { where: object; select: any }) => {
    assert.deepEqual(args.where, { institutionId, academicYearId, archivedAt: null });
    assert.deepEqual(args.select.studentExamResults.where, { institutionId });
    assert.deepEqual(args.select.examQuestions.where, { institutionId });
    assert.deepEqual(args.select.examQuestions.select.studentScores.where, { institutionId });
    return rows.filter(row => Object.entries(args.where).every(([key, value]) => row[key as keyof typeof row] === value));
  });
  assert.deepEqual((await scopedAnalytics(institutionId, academicYearId)).examStatus, [
    { id: 'completed', label: 'مكتملة', count: 1 },
    { id: 'incomplete', label: 'جارية أو غير مكتملة', count: 1 },
    { id: 'upcoming', label: 'قادمة', count: 1 },
  ]);
});

test('foreign/year-mismatched dimensions and invalid denominators cannot contribute; empty means no data', async (t) => {
  const row = exam();
  row.examQuestions[0].skill.institutionId = 'institution-b';
  row.examQuestions[0].topic.academicYearId = '2026-2027';
  row.examQuestions[1].maxScore = 0;
  t.mock.method(db.exam, 'findMany', async () => [row]);
  assert.deepEqual((await scopedAnalytics(institutionId, academicYearId)).skillPerformance, []);
});

test('skills and topics share normalized descending ranking with distinct identities', async (t) => {
  const row = exam();
  row.examQuestions[0].skill = dimension('same-id');
  row.examQuestions[0].topic = dimension('same-id');
  t.mock.method(db.exam, 'findMany', async () => [row]);
  const items = (await scopedAnalytics(institutionId, academicYearId)).skillPerformance;
  assert.deepEqual(items.map(item => item.average), [100, 100, 50, 50]);
  assert.equal(new Set(items.map(item => `${item.kind}:${item.id}`)).size, 4);
});
