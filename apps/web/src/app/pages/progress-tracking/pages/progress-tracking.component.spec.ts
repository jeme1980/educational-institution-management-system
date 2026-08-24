import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { progressSummaryText, usableProgressPoints } from './progress-tracking.component';
import { ProgressTrackingPoint } from '../models/progress-tracking.model';

const point = (id: string, averagePercentage: number | null, noData = false): ProgressTrackingPoint => ({ examId: id, examName: `Exam ${id}`, examDate: '2026-01-01', examType: null, maxScore: 20, participantCount: averagePercentage === null ? 0 : 1, eligibleCount: 1, averagePercentage, passRate: averagePercentage, noData });

describe('ProgressTracking presentation rules', () => {
  it('does not show a trend until two data-bearing exams exist', () => {
    expect(usableProgressPoints([])).toHaveLength(0);
    expect(usableProgressPoints([point('one', 70)])).toHaveLength(1);
    expect(progressSummaryText([point('one', 70)])).toBe('');
  });

  it('summarizes the first and latest backend points without exposing IDs', () => {
    expect(progressSummaryText([point('one', 64.2), point('two', 71.8)])).toBe('ارتفع متوسط الأداء من 64.2% إلى 71.8% عبر 2 امتحانات.');
    expect(progressSummaryText([point('one', null, true), point('two', 71.8), point('three', 68.1)])).toContain('انخفض');
    expect(progressSummaryText([point('secret-id', 64.2), point('next-id', 71.8)])).not.toContain('secret-id');
  });
});
