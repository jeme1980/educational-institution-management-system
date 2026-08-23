import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PERFORMANCE_LEVELS, AnalysisStudent } from '../models/exam-analysis.model';
import { ExamAnalysisCalculatorService } from '../services/exam-analysis-calculator.service';
import { buildInterventionGroups } from './exam-analysis.component';

describe('ExamAnalysis intervention reactivity', () => {
  it('moves a student between level groups when levels change without reload', () => {
    const levels = signal(DEFAULT_PERFORMANCE_LEVELS.map(level => ({ ...level })));
    const rawStudents: AnalysisStudent[] = [{
      studentId: 'student-1',
      studentName: 'Student 1',
      totalScore: 80,
      isAbsent: false,
      questionScores: [],
    }];
    const calculator = new ExamAnalysisCalculatorService();
    const students = computed(() => calculator.students(rawStudents, [], 100, levels()));
    const interventionGroups = computed(() => buildInterventionGroups(levels(), students()));

    expect(interventionGroups().find(group => group.color === '#2563eb')?.students.map(student => student.studentId)).toEqual(['student-1']);

    levels.set([
      { id: 'high', name: 'High', min: 75, max: 100, color: '#16a34a' },
      { id: 'upper-mid', name: 'Upper mid', min: 50, max: 74.99, color: '#2563eb' },
      { id: 'lower-mid', name: 'Lower mid', min: 25, max: 49.99, color: '#f59e0b' },
      { id: 'low', name: 'Low', min: 0, max: 24.99, color: '#dc2626' },
    ]);

    expect(interventionGroups().find(group => group.color === '#16a34a')?.students.map(student => student.studentId)).toEqual(['student-1']);
    expect(interventionGroups().find(group => group.color === '#2563eb')?.students).toEqual([]);
  });

  it('uses the level name and color for a newly added level', () => {
    const levels = [{ id: 'new-level', name: 'New level', min: 0, max: 100, color: '#64748b' }];
    const groups = buildInterventionGroups(levels, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'New level', color: '#64748b', students: [] });
    expect(groups[0].duration).toBeTruthy();
    expect(groups[0].activity).toBeTruthy();
  });
});
