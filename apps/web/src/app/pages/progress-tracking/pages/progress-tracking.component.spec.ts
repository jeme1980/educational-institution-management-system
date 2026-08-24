import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { progressSummaryText, studentInsightText, studentParticipationLabel, usableProgressPoints } from './progress-tracking.component';
import { ProgressTrackingPoint, StudentProgressResponse } from '../models/progress-tracking.model';

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

  it('keeps student absent and missing states out of the trend summary', () => {
    const response = { summary: { examsCount: 3, completedCount: 2, firstPercentage: 60, latestPercentage: 72.5, change: 12.5, currentGroupGap: -3 }, points: [
      { ...point('one', 60), participationStatus: 'completed', studentScore: 12, studentPercentage: 60, groupAveragePercentage: 63, groupPassRate: 100, groupParticipantCount: 2, gapFromGroup: -3 },
      { ...point('two', 70), participationStatus: 'absent', studentScore: null, studentPercentage: null, groupAveragePercentage: 70, groupPassRate: 100, groupParticipantCount: 2, gapFromGroup: null },
      { ...point('three', 72.5), participationStatus: 'completed', studentScore: 14.5, studentPercentage: 72.5, groupAveragePercentage: 70, groupPassRate: 100, groupParticipantCount: 2, gapFromGroup: 2.5 },
    ], context: { academicYear: { id: 'year', yearLabel: '2026' }, subject: { id: 'subject', nameAr: 'Math' }, studyGroup: { id: 'group', nameAr: 'A', subjectId: 'subject' } } } as StudentProgressResponse;
    expect(studentInsightText(response)).toContain('12.5');
    expect(studentInsightText(response)).not.toContain('one');
    expect(studentParticipationLabel('absent')).toBe('غائب');
    expect(studentParticipationLabel('missing')).toBe('لا توجد نتيجة');
  });
});
