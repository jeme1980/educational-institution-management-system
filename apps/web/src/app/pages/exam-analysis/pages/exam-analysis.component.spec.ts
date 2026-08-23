import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PERFORMANCE_LEVELS, AnalysisStudent } from '../models/exam-analysis.model';
import { ExamAnalysisCalculatorService } from '../services/exam-analysis-calculator.service';
import { buildInterventionGroups, buildOverviewChartSegments, buildOverviewGroupBars } from './exam-analysis.component';

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

  it('uses shared stat-card tones for the primary KPI row', () => {
    expect(overviewTemplate).toContain('overview-kpi-row--primary');
    expect(overviewTemplate).toContain('tone="primary"');
    expect(overviewTemplate).toContain('tone="success"');
  });

  it('keeps donut percentages finite and sums them to 100 when data exists', () => {
    const segments = buildOverviewChartSegments(levels, 10);
    expect(segments.reduce((sum, segment) => sum + segment.percentage, 0)).toBeCloseTo(100, 6);
    expect(segments.every(segment => Number.isFinite(segment.percentage))).toBe(true);
  });

  it('returns zero-safe donut geometry for empty data', () => {
    const segments = buildOverviewChartSegments(levels.map(level => ({ ...level, count: 0 })), 0);
    expect(segments.every(segment => segment.percentage === 0 && !Number.isNaN(segment.dashoffset))).toBe(true);
    expect(JSON.stringify(segments)).not.toMatch(/NaN|Infinity/);
  });

  it('tracks dynamic level counts by stable level id', () => {
    const segments = buildOverviewChartSegments([{ ...levels[0], id: 'custom-level', count: 4 }], 4);
    expect(segments).toMatchObject([{ id: 'custom-level', count: 4, percentage: 100 }]);
  });

  it('shows the group comparison only when more than one group is available', () => {
    expect(buildOverviewGroupBars([])).toHaveLength(0);
    expect(buildOverviewGroupBars([{ id: 'one', name: 'One', summary: { average: 80, passRate: 75 } }])).toHaveLength(1);
    expect(buildOverviewGroupBars([
      { id: 'one', name: 'One', summary: { average: 80, passRate: 75 } },
      { id: 'two', name: 'Two', summary: { average: 60, passRate: 50 } },
    ])).toHaveLength(2);
  });

  it('exposes accessible SVG labels and native titles for chart data', () => {
    expect(overviewTemplate).toContain('role="img" aria-label="توزيع مستويات الأداء حسب عدد الطلاب والنسبة"');
    expect(overviewTemplate).toContain('role="img" aria-label="مقارنة الشعب حسب متوسط الأداء ونسبة النجاح"');
    expect(overviewTemplate).toContain('<title>{{ segment.name }} — {{ segment.count }} طالب — {{ format(segment.percentage) }}%</title>');
    expect(overviewTemplate).toContain('<title>{{ bar.name }} — متوسط الأداء {{ format(bar.average) }}% — نسبة النجاح {{ format(bar.passRate) }}%</title>');
  });
});
