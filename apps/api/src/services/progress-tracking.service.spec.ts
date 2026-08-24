import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDimensionProgressPoint, buildProgressTrackingPoints, buildStudentProgressPoints } from './progress-tracking.service';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('progress tracking normalizes different max scores and excludes absent/missing results', () => {
  const points = buildProgressTrackingPoints([
    { id: 'b', titleAr: 'ثاني', examDate: date('2026-02-01'), maxScore: 20, examType: null, eligibleStudentIds: ['s1', 's2', 's3'], results: [{ studentId: 's1', totalScore: 16, isAbsence: false }, { studentId: 's2', totalScore: 0, isAbsence: true }] },
    { id: 'a', titleAr: 'أول', examDate: date('2026-01-01'), maxScore: 10, examType: null, eligibleStudentIds: ['s1', 's2'], results: [{ studentId: 's1', totalScore: 7, isAbsence: false }] },
  ]);
  assert.deepEqual(points.map((point) => point.examId), ['a', 'b']);
  assert.equal(points[0].averagePercentage, 70);
  assert.equal(points[0].participantCount, 1);
  assert.equal(points[1].averagePercentage, 80);
  assert.equal(points[1].passRate, 100);
  assert.equal(points[1].eligibleCount, 3);
});

test('progress tracking marks zero-data exams without turning them into zero performance', () => {
  const [point] = buildProgressTrackingPoints([{ id: 'a', titleAr: 'بدون نتائج', examDate: date('2026-01-01'), maxScore: 100, examType: null, eligibleStudentIds: ['s1'], results: [] }]);
  assert.equal(point.noData, true);
  assert.equal(point.averagePercentage, null);
  assert.equal(point.passRate, null);
});

test('student progress preserves absent/missing status and calculates group gaps', () => {
  const points = buildProgressTrackingPoints([
    { id: 'one', titleAr: 'One', examDate: date('2026-01-01'), maxScore: 20, examType: null, eligibleStudentIds: ['student', 'other'], results: [{ studentId: 'student', totalScore: 12, isAbsence: false }, { studentId: 'other', totalScore: 10, isAbsence: false }] },
    { id: 'two', titleAr: 'Two', examDate: date('2026-02-01'), maxScore: 50, examType: null, eligibleStudentIds: ['student'], results: [{ studentId: 'student', totalScore: 0, isAbsence: true }] },
    { id: 'three', titleAr: 'Three', examDate: date('2026-03-01'), maxScore: 100, examType: null, eligibleStudentIds: ['student'], results: [] },
  ]);
  const student = buildStudentProgressPoints(points, new Map([
    ['one', { totalScore: 12, isAbsence: false }],
    ['two', { totalScore: 0, isAbsence: true }],
  ]));
  assert.deepEqual(student.map((point) => point.participationStatus), ['completed', 'absent', 'missing']);
  assert.equal(student[0].studentPercentage, 60);
  assert.equal(student[0].groupAveragePercentage, 55);
  assert.equal(student[0].gapFromGroup, 5);
  assert.equal(student[1].studentPercentage, null);
  assert.equal(student[2].studentPercentage, null);
});

test('dimension progress distinguishes measured, not measured, and unavailable detail', () => {
  const input = {
    examId: 'exam', examName: 'Exam', examDate: '2026-01-01', participantIds: ['s1', 's2'],
    questions: [
      { id: 'q1', maxPoints: 10, dimensionId: 'skill-1', dimensionName: 'Skill 1' },
      { id: 'q2', maxPoints: 10, dimensionId: 'skill-1', dimensionName: 'Skill 1' },
    ],
    scores: [
      { studentId: 's1', questionId: 'q1', score: 8 },
      { studentId: 's1', questionId: 'q2', score: 6 },
      { studentId: 's2', questionId: 'q1', score: 4 },
    ],
  };
  const measured = buildDimensionProgressPoint(input, 'skill-1');
  assert.equal(measured.status, 'measured');
  assert.equal(measured.masteryRate, 45);
  assert.equal(measured.unansweredRate, 25);
  assert.equal(buildDimensionProgressPoint(input, 'skill-2').status, 'notMeasured');
  assert.equal(buildDimensionProgressPoint({ ...input, scores: [] }, 'skill-1').status, 'detailUnavailable');
});
