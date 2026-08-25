import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateActionItems, ActionCenterInput } from './action-center.service';

const base = { academicYear: { id: 'year', yearLabel: '2025-2026' }, subject: { id: 'subject', nameAr: 'علوم' }, studyGroup: { id: 'group', nameAr: 'أ' } };
const point = (id: string, averagePercentage: number | null) => ({ examId: id, examName: id, examDate: id, examType: null, maxScore: 100, participantCount: 1, eligibleCount: 1, averagePercentage, passRate: null, noData: averagePercentage === null });
const studentPoint = (id: string, value: number | null, status: 'completed' | 'absent' | 'missing' = 'completed') => ({ examId: id, examName: id, examDate: id, examType: null, maxScore: 100, participantCount: 1, eligibleCount: 1, averagePercentage: 70, passRate: null, noData: false, participationStatus: status, studentScore: value, studentPercentage: value, groupAveragePercentage: 70, groupPassRate: null, groupParticipantCount: 1, gapFromGroup: null });

function input(overrides: Partial<ActionCenterInput> = {}): ActionCenterInput { return { ...base, classPoints: [point('1', 80), point('2', 70)], studentPoints: [{ id: 'student', name: 'طالب', points: [studentPoint('1', 80), studentPoint('2', 60)] }], dimensions: [{ id: 'skill', name: 'مهارة', points: [{ status: 'measured', masteryRate: 80, examId: '1' }, { status: 'measured', masteryRate: 70, examId: '2' }] }], interventions: [], ...overrides }; }

test('aggregates only fact-based negative changes and sorts by action type', () => {
  const items = aggregateActionItems(input({ interventions: [{ id: 'i', title: 'خطة', targetedStudentCount: 2, measuredStudentCount: 0, baselineMastery: 60, latestMastery: null, criterionMet: null, ...base }] }));
  assert.deepEqual(items.map((item) => item.type), ['INTERVENTION_NO_FOLLOWUP', 'STUDENT_DECLINE', 'CLASS_DECLINE', 'DIMENSION_DECLINE']);
});

test('excludes improving, absent-only, and one-measurement signals', () => {
  const items = aggregateActionItems(input({ classPoints: [point('1', 70), point('2', 80)], studentPoints: [{ id: 'student', name: 'طالب', points: [studentPoint('1', 80, 'absent'), studentPoint('2', null, 'missing')] }], dimensions: [{ id: 'skill', name: 'مهارة', points: [{ status: 'measured', masteryRate: 80, examId: '1' }] }] }));
  assert.equal(items.length, 0);
});

test('emits criterion and low coverage separately without deduplicating distinct action types', () => {
  const items = aggregateActionItems(input({ classPoints: [], studentPoints: [], dimensions: [], interventions: [{ id: 'criterion', title: 'معيار', targetedStudentCount: 1, measuredStudentCount: 1, baselineMastery: 50, latestMastery: 55, criterionMet: false, ...base }, { id: 'coverage', title: 'تغطية', targetedStudentCount: 2, measuredStudentCount: 1, baselineMastery: 50, latestMastery: 55, criterionMet: true, ...base }] }));
  assert.deepEqual(items.map((item) => item.type), ['INTERVENTION_CRITERION_NOT_MET', 'INTERVENTION_LOW_COVERAGE']);
});
