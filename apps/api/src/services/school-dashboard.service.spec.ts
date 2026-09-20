import assert from 'node:assert/strict';
import test from 'node:test';
import { addNormalizedResults, createDashboardAccumulator, dashboardAverage } from './school-dashboard.service';

test('school dashboard uses weighted normalized results rather than averaging exam averages', () => {
  const row = createDashboardAccumulator();
  addNormalizedResults(row, 'exam-a', 100, Array.from({ length: 10 }, (_, index) => ({ studentId: `class-a-${index}`, totalScore: 100, isAbsence: false })));
  addNormalizedResults(row, 'exam-b', 100, Array.from({ length: 30 }, (_, index) => ({ studentId: `class-b-${index}`, totalScore: 50, isAbsence: false })));
  assert.equal(dashboardAverage(row), 62.5);
  assert.equal(row.examIds.size, 2);
  assert.equal(row.studentIds.size, 40);
});

test('school dashboard excludes absences and students outside the selected classes', () => {
  const row = createDashboardAccumulator();
  addNormalizedResults(row, 'exam-a', 20, [
    { studentId: 'eligible', totalScore: 18, isAbsence: false },
    { studentId: 'absent', totalScore: 20, isAbsence: true },
    { studentId: 'other-class', totalScore: 20, isAbsence: false },
  ], new Set(['eligible', 'absent']));
  assert.equal(dashboardAverage(row), 90);
  assert.deepEqual([...row.studentIds], ['eligible']);
});

test('school dashboard counts an exam once even when accumulated for multiple groups', () => {
  const row = createDashboardAccumulator();
  addNormalizedResults(row, 'shared-exam', 10, [{ studentId: 'student-a', totalScore: 8, isAbsence: false }]);
  addNormalizedResults(row, 'shared-exam', 10, [{ studentId: 'student-b', totalScore: 7, isAbsence: false }]);
  assert.equal(row.examIds.size, 1);
  assert.equal(row.studentIds.size, 2);
});
