import { describe, expect, it } from 'vitest';
import { buildDashboardComparisonEntities, compactChartLabel, pruneDashboardSelection, schoolDashboardKpiValues, selectCurrentAcademicYear, selectedDashboardIds, shouldShowGroupComparison, sortDashboardExamTrend } from './school-dashboard.helpers';

describe('School dashboard helpers', () => {
  const gradePoint = (grade: number, date = '2025-12-20', type = 'mid') => ({
    examId: `${type}-${7 - grade}`, examDate: date, examTypeId: type,
    gradeLevelId: `grade-${7 - grade}`, gradeSortOrder: grade,
    gradeLevelName: ['ثالث', 'رابع', 'خامس', 'سادس'][grade - 3],
    averagePerformance: grade * 11 - 2,
  });

  it('sorts whole grade points by official order, independent of names and IDs', () => {
    const input = [6, 3, 5, 4].map(grade => gradePoint(grade));
    const rows = sortDashboardExamTrend(input);
    expect(rows.map(row => row.gradeLevelName)).toEqual(['ثالث', 'رابع', 'خامس', 'سادس']);
    expect(rows.map(row => row.averagePerformance)).toEqual([31, 42, 53, 64]);
    expect(input.map(row => row.gradeSortOrder)).toEqual([6, 3, 5, 4]);
    expect(rows[0]).toBe(input[1]);
  });

  it('orders dates across years before grades, and every exam type shares that order', () => {
    const input = [5, 4, 6, 3].map(grade => gradePoint(grade, '2026-12-20', 'final'))
      .concat([6, 3, 4, 5].map(grade => gradePoint(grade)));
    const rows = sortDashboardExamTrend(input);
    expect(rows.map(row => row.gradeSortOrder)).toEqual([3, 4, 5, 6, 3, 4, 5, 6]);
    expect(rows.map(row => row.averagePerformance)).toEqual([31, 42, 53, 64, 31, 42, 53, 64]);
    expect(rows.slice(0, 4).every(row => row.examDate === '2025-12-20')).toBe(true);
  });

  it('keeps only selected grades and sorts missing orders last with deterministic ties', () => {
    expect(sortDashboardExamTrend([6, 3, 5].map(grade => gradePoint(grade))).map(row => row.gradeSortOrder)).toEqual([3, 5, 6]);
    const rows = [
      { examDate: '2025-12-20', examId: 'b', gradeLevelId: 'z', gradeSortOrder: null },
      { examDate: '2025-12-20', examId: 'z', gradeLevelId: 'b', gradeSortOrder: 3 },
      { examDate: '2025-12-20', examId: 'a', gradeLevelId: 'a' },
      { examDate: '2025-12-20', examId: 'a', gradeLevelId: 'b', gradeSortOrder: 3 },
      { examDate: '2025-12-20', examId: 'zero', gradeLevelId: 'zero', gradeSortOrder: 0 },
    ];
    expect(sortDashboardExamTrend(rows).map(row => row.examId)).toEqual(['zero', 'a', 'z', 'a', 'b']);
    expect(sortDashboardExamTrend(rows)).toEqual(sortDashboardExamTrend([...rows].reverse()));
  });
  it('selects the current academic year without falling back to an arbitrary year', () => {
    expect(selectCurrentAcademicYear([{ id: 'old' }, { id: 'current', isCurrent: true }])).toEqual({ id: 'current', isCurrent: true });
    expect(selectCurrentAcademicYear([{ id: 'old' }])).toBeUndefined();
  });
  it('hides group comparison when there is only one or no group', () => {
    expect(shouldShowGroupComparison(0)).toBe(false); expect(shouldShowGroupComparison(1)).toBe(false); expect(shouldShowGroupComparison(2)).toBe(true);
  });
  it('keeps zero data finite and renders a deliberate empty average', () => {
    expect(schoolDashboardKpiValues(null)).toEqual(['—', 0, 0, 0, 0]);
  });
  it('compacts only the chart display label while preserving a readable prefix', () => {
    expect(compactChartLabel('الصف التجريبي — الرياضيات', 16)).toHaveLength(16);
    expect(compactChartLabel('علوم')).toBe('علوم');
  });
  it('represents all explicitly while omitting it from API filters', () => {
    expect(selectedDashboardIds(['ALL'])).toEqual([]);
    expect(selectedDashboardIds(['year-a', 'year-b'])).toEqual(['year-a', 'year-b']);
  });
  it('prunes dependent selections and falls back to all when none remain', () => {
    expect(pruneDashboardSelection(['class-a', 'class-b'], ['class-b', 'class-c'])).toEqual(['class-b']);
    expect(pruneDashboardSelection(['class-a'], ['class-b'])).toEqual(['ALL']);
    expect(pruneDashboardSelection(['ALL'], ['class-b'])).toEqual(['ALL']);
  });

  it('shows grade-level entities when no classes are selected', () => {
    const entities = buildDashboardComparisonEntities(['ALL'], [], [
      { id: 'grade-b', nameAr: 'الثانية', sortOrder: 2 },
      { id: 'grade-a', nameAr: 'الأولى', sortOrder: 1 },
    ]);
    expect(entities.map((item) => item.label)).toEqual(['الأولى', 'الثانية']);
  });

  it('adds one grade average after one or several selected classes in that grade', () => {
    const grades = [{ id: 'grade-a', nameAr: 'المرحلة الأولى', sortOrder: 1 }];
    const classes = [
      { id: 'class-b', nameAr: 'الأول ب', gradeLevelId: 'grade-a', gradeLevelName: 'المرحلة الأولى', yearLabel: '2026' },
      { id: 'class-a', nameAr: 'الأول أ', gradeLevelId: 'grade-a', gradeLevelName: 'المرحلة الأولى', yearLabel: '2026' },
    ];
    expect(buildDashboardComparisonEntities(['class-a'], classes, grades).map((item) => item.label)).toEqual(['الأول أ', 'متوسط المرحلة الأولى']);
    expect(buildDashboardComparisonEntities(['class-a', 'class-b'], classes, grades).map((item) => item.label)).toEqual(['الأول أ', 'الأول ب', 'متوسط المرحلة الأولى']);
  });

  it('groups selected classes with one benchmark for each related grade', () => {
    const entities = buildDashboardComparisonEntities(['class-a', 'class-b'], [
      { id: 'class-b', nameAr: 'الثاني أ', gradeLevelId: 'grade-b', gradeLevelName: 'الثانية', yearLabel: '2026' },
      { id: 'class-a', nameAr: 'الأول أ', gradeLevelId: 'grade-a', gradeLevelName: 'الأولى', yearLabel: '2026' },
    ], [
      { id: 'grade-a', nameAr: 'الأولى', sortOrder: 1 },
      { id: 'grade-b', nameAr: 'الثانية', sortOrder: 2 },
    ]);
    expect(entities.map((item) => item.label)).toEqual(['الأول أ', 'متوسط الأولى', 'الثاني أ', 'متوسط الثانية']);
  });

  it('orders trend points by actual date and preserves repeated exams of the same type', () => {
    const rows = sortDashboardExamTrend([
      { examId: 'exam-c', examDate: '2026-03-01T00:00:00.000Z', examTypeId: 'quiz' },
      { examId: 'exam-a', examDate: '2025-11-01T00:00:00.000Z', examTypeId: 'quiz' },
      { examId: 'exam-b', examDate: '2026-01-01T00:00:00.000Z', examTypeId: 'final' },
    ]);
    expect(rows.map((item) => item.examId)).toEqual(['exam-a', 'exam-b', 'exam-c']);
    expect(rows.filter((item) => item.examTypeId === 'quiz')).toHaveLength(2);
  });
});
