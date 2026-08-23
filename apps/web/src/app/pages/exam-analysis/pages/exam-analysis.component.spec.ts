import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PERFORMANCE_LEVELS, AnalysisStudent } from '../models/exam-analysis.model';
import { ExamAnalysisCalculatorService } from '../services/exam-analysis-calculator.service';
import { buildInterventionGroups } from './exam-analysis.component';
import { performanceDonutData } from '../components/performance-donut-chart.component';
import { performanceGroupBarData } from '../components/performance-bar-chart.component';

const overviewTemplate = readFileSync(new URL('./exam-analysis.component.html', import.meta.url), 'utf8');

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

describe('ExamAnalysis overview visuals', () => {
  const levels = DEFAULT_PERFORMANCE_LEVELS.map((level, index) => ({ ...level, count: index + 1 }));

  it('maps the primary KPI row to shared semantic variants', () => {
    expect(overviewTemplate).toContain('overview-kpi-row--primary');
    expect(overviewTemplate).toContain('tone="neutral"');
    expect(overviewTemplate).toContain('tone="success"');
  });

  it('keeps donut percentages finite and sums them to 100 when data exists', () => {
    const data = performanceDonutData(levels);
    const counts = data.datasets[0].data as number[];
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(10);
    expect(counts.every(count => Number.isFinite(count))).toBe(true);
  });

  it('keeps zero-data charts finite', () => {
    const donut = performanceDonutData(levels.map(level => ({ ...level, count: 0 })));
    const bars = performanceGroupBarData([{ id: 'empty', name: 'Empty', summary: { average: 0, passRate: 0 } }]);
    expect(JSON.stringify({ donut, bars })).not.toMatch(/NaN|Infinity/);
  });

  it('tracks dynamic level counts by stable level id', () => {
    const data = performanceDonutData([{ ...levels[0], id: 'custom-level', count: 4 }]);
    expect(data.labels).toEqual([levels[0].name]);
  });

  it('shows the group comparison only when more than one group is available', () => {
    expect(performanceGroupBarData([]).labels).toHaveLength(0);
    expect(performanceGroupBarData([{ id: 'one', name: 'One', summary: { average: 80, passRate: 75 } }]).labels).toHaveLength(1);
    expect(performanceGroupBarData([
      { id: 'one', name: 'One', summary: { average: 80, passRate: 75 } },
      { id: 'two', name: 'Two', summary: { average: 60, passRate: 50 } },
    ]).labels).toHaveLength(2);
  });
});
