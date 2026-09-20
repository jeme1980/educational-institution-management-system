import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ApiService, SubjectItem } from '../../../core/services/api.service';
import { ALL_GRADE_CLASSES, classContextComplete, dimensionCanShowTrend, dimensionCoverageText, dimensionStatusLabel, isSpecificStudyGroup, progressFilterAvailability, progressSubjectOptions, ProgressTrackingComponent, progressSummaryText, studentContextComplete, studentInsightText, studentParticipationLabel, usableProgressPoints } from './progress-tracking.component';
import { ProgressTrackingPoint, StudentProgressResponse } from '../models/progress-tracking.model';

const point = (id: string, averagePercentage: number | null, noData = false): ProgressTrackingPoint => ({ examId: id, examName: `Exam ${id}`, examDate: '2026-01-01', examType: null, maxScore: 20, participantCount: averagePercentage === null ? 0 : 1, eligibleCount: 1, averagePercentage, passRate: averagePercentage, noData });
const subject = (id: string, nameAr: string, academicYearId = '2025-2026'): SubjectItem => ({ id, nameAr, academicYearId, institutionId: 'school', isActive: true });

describe('ProgressTracking presentation rules', () => {
  it('uses mode-specific context contracts for loading', () => {
    expect(classContextComplete('year', 'subject', 'grade', ALL_GRADE_CLASSES)).toBe(true);
    expect(classContextComplete('year', 'subject', '', ALL_GRADE_CLASSES)).toBe(false);
    expect(isSpecificStudyGroup(ALL_GRADE_CLASSES)).toBe(false);
    expect(studentContextComplete('year', 'subject', 'grade', ALL_GRADE_CLASSES, 'student')).toBe(false);
    expect(studentContextComplete('year', 'subject', 'grade', 'group', 'student')).toBe(true);
  });

  it('shows all active subjects for the selected year without requiring a grade', () => {
    const subjects = [subject('math', 'رياضيات'), subject('science', 'علوم'), subject('english', 'إنجليزي'), subject('other', 'تاريخ', '2026-2027')];
    expect(progressSubjectOptions(subjects, '2025-2026').map((item) => item.nameAr)).toEqual(['رياضيات', 'علوم', 'إنجليزي']);
    expect(progressFilterAvailability('2025-2026', '', '')).toEqual({ subjectEnabled: true, gradeEnabled: false, classEnabled: false });
    expect(progressFilterAvailability('2025-2026', 'math', '')).toEqual({ subjectEnabled: true, gradeEnabled: true, classEnabled: false });
    expect(progressFilterAvailability('2025-2026', 'math', 'grade-1')).toEqual({ subjectEnabled: true, gradeEnabled: true, classEnabled: true });
  });

  it('reloads subjects on year change, clears dependent context, and ignores stale responses', async () => {
    const resolvers = new Map<string, (subjects: SubjectItem[]) => void>();
    const api = {
      selectedAcademicYearId: signal('year-a'), academicYears: signal([{ id: 'year-a', isCurrent: true }, { id: 'year-b' }]), subjects: signal([]),
      loadSubjectsForAcademicYear: (yearId: string) => new Promise<SubjectItem[]>((resolve) => resolvers.set(yearId, resolve)),
      loadProgressTrackingStudyGroups: async () => [],
    };
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: api },
      { provide: Router, useValue: { navigate: async () => true } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
    ] });
    const component = TestBed.runInInjectionContext(() => new ProgressTrackingComponent());
    component.selectedSubjectId.set('stale-subject'); component.selectedGradeLevelId.set('stale-grade'); component.selectedStudyGroupId.set('stale-class');
    component.onYearChange('year-b');
    expect(component.selectedSubjectId()).toBe(''); expect(component.selectedGradeLevelId()).toBe(''); expect(component.selectedStudyGroupId()).toBe('');
    resolvers.get('year-b')?.([subject('math-b', 'رياضيات ب', 'year-b')]);
    await Promise.resolve(); await Promise.resolve();
    expect(component.subjectsForYear().map((item) => item.id)).toEqual(['math-b']);
    expect(component.selectedSubjectId()).toBe('');
    resolvers.get('year-a')?.([subject('stale', 'مادة قديمة', 'year-a')]);
    await Promise.resolve(); await Promise.resolve();
    expect(component.subjectsForYear().map((item) => item.id)).toEqual(['math-b']);
    component.onSubjectChange('math-b');
    expect(component.selectedSubjectId()).toBe('math-b');
    expect(component.filterAvailability().gradeEnabled).toBe(true);
  });

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

  it('keeps dimension status and coverage presentation semantic and ID-free', () => {
    expect(dimensionStatusLabel('measured')).toBe('مقاس');
    expect(dimensionStatusLabel('notMeasured')).toBe('غير مقاس');
    expect(dimensionStatusLabel('detailUnavailable')).toBe('تفاصيل القياس غير متاحة');
    expect(dimensionCoverageText(2, 5)).toBe('2 / 5 امتحان مقاس');
    expect(dimensionCanShowTrend(1)).toBe(false);
    expect(dimensionCanShowTrend(2)).toBe(true);
  });
});
