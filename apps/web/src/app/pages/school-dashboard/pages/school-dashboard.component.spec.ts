import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiService } from '../../../core/services/api.service';
import { SchoolDashboardComponent, SchoolDashboardData } from './school-dashboard.component';

const year = { id: '00000000-0000-4000-8000-000000000001', yearLabel: '2025-2026', isCurrent: true };
const subject = { key: '10000000-0000-4000-8000-000000000001', nameAr: 'رياضيات', label: 'رياضيات', subjectIds: ['10000000-0000-4000-8000-000000000001'], academicYearIds: [year.id] };
const dashboard: SchoolDashboardData = {
  context: { academicYears: [year], subject: null },
  options: {
    academicYears: [year], subjects: [subject],
    gradeLevels: [{ id: 'grade-a', nameAr: 'المرحلة الأولى', sortOrder: 1 }, { id: 'grade-b', nameAr: 'المرحلة الثانية', sortOrder: 2 }],
    classes: [
      { id: 'class-a', nameAr: 'الأول أ', gradeLevelId: 'grade-a', gradeLevelName: 'المرحلة الأولى', academicYearId: year.id, yearLabel: year.yearLabel },
      { id: 'class-b', nameAr: 'الثاني أ', gradeLevelId: 'grade-b', gradeLevelName: 'المرحلة الثانية', academicYearId: year.id, yearLabel: year.yearLabel },
    ],
    examTypes: [{ id: 'type-a', nameAr: 'نصفي', sortOrder: 1 }],
  },
  summary: { schoolAverage: null, examCount: 0, participatingStudentCount: 0, subjectCount: 0, studyGroupCount: 0 },
  coverage: { subjectsWithExams: 0, studyGroupsWithExams: 0, subjectsWithTwoExams: 0, studyGroupsWithTwoExams: 0, examsWithQuestionDetail: 0, examsWithoutQuestionDetail: 0 },
  bySubject: [], byClass: [], byGrade: [], byExamType: [], byClassExamType: [], byGradeExamType: [], examTrend: [],
};

class DashboardApiStub {
  readonly academicYears = signal([year]);
  nextResult: Promise<SchoolDashboardData> | null = null;
  async loadAcademicYears(): Promise<void> { return undefined; }
  loadSchoolDashboard(): Promise<SchoolDashboardData> { return this.nextResult || Promise.resolve(dashboard); }
}

describe('SchoolDashboardComponent context controls', () => {
  let fixture: ComponentFixture<SchoolDashboardComponent>;
  let api: DashboardApiStub;

  beforeEach(async () => {
    api = new DashboardApiStub();
    await TestBed.configureTestingModule({
      imports: [SchoolDashboardComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(SchoolDashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    if (!fixture.componentInstance.data()) await fixture.componentInstance.load();
    fixture.detectChanges();
  });

  it('shows All by default and keeps the selected subject label while refetching', async () => {
    const select = fixture.nativeElement.querySelector('ui-select select') as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent?.trim()).toBe('كل المواد');

    let resolveRequest!: (value: SchoolDashboardData) => void;
    api.nextResult = new Promise((resolve) => { resolveRequest = resolve; });
    expect(select.options).toHaveLength(2);
    expect(select.options[1].value).toBe(subject.key);
    select.options[1].selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.subjectKey()).toBe(subject.key);
    expect(select.selectedOptions[0].textContent?.trim()).toBe('رياضيات');

    resolveRequest({ ...dashboard, context: { ...dashboard.context, subject: { key: subject.key, nameAr: subject.nameAr } } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(select.selectedOptions[0].textContent?.trim()).toBe('رياضيات');
    expect(fixture.componentInstance.contextSummary()).toContain('رياضيات');
  });

  it('resets the subject to All when years change', async () => {
    fixture.componentInstance.subjectKey.set(subject.key);
    await fixture.componentInstance.yearsChanged([year.id]);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('ui-select select') as HTMLSelectElement;
    expect(fixture.componentInstance.subjectKey()).toBe('');
    expect(select.selectedOptions[0].textContent?.trim()).toBe('كل المواد');
  });

  it('filters class options immediately and clears stale class selections when grades change', async () => {
    fixture.componentInstance.selectedClassIds.set(['class-b']);
    await fixture.componentInstance.gradesChanged(['grade-a']);

    expect(fixture.componentInstance.classOptions().map((option) => option.id)).toEqual(['class-a']);
    expect(fixture.componentInstance.selectedClassIds()).toEqual(['ALL']);
  });

  it('separates exam types in class comparisons and keeps every dated trend point', () => {
    const typeB = { id: 'type-b', nameAr: 'نهائي', sortOrder: 2 };
    fixture.componentInstance.data.set({
      ...dashboard,
      options: { ...dashboard.options, examTypes: [...dashboard.options.examTypes, typeB] },
      byClassExamType: [
        { ...dashboard.options.classes[0], sortOrder: 1, examTypeId: 'type-a', examTypeName: 'نصفي', averagePerformance: 70, participatingStudents: 20, examCount: 2 },
        { ...dashboard.options.classes[0], sortOrder: 2, examTypeId: 'type-b', examTypeName: 'نهائي', averagePerformance: 80, participatingStudents: 18, examCount: 1 },
      ],
      byGradeExamType: [
        { id: 'grade-a', nameAr: 'المرحلة الأولى', gradeSortOrder: 1, examTypeId: 'type-a', examTypeName: 'نصفي', sortOrder: 1, averagePerformance: 65, participatingStudents: 60, examCount: 2 },
        { id: 'grade-a', nameAr: 'المرحلة الأولى', gradeSortOrder: 1, examTypeId: 'type-b', examTypeName: 'نهائي', sortOrder: 2, averagePerformance: 75, participatingStudents: 55, examCount: 1 },
      ],
      examTrend: [
        { examId: 'exam-2', examDate: '2026-04-10T00:00:00.000Z', examTitle: 'نهائي الرياضيات', academicYearId: 'year-2', yearLabel: '2026-2027', examTypeId: 'type-b', examTypeName: 'نهائي', sortOrder: 2, averagePerformance: 80, participatingStudents: 18, examCount: 1 },
        { examId: 'exam-1', examDate: '2025-11-10T00:00:00.000Z', examTitle: 'نصفي الرياضيات', academicYearId: year.id, yearLabel: year.yearLabel, examTypeId: 'type-a', examTypeName: 'نصفي', sortOrder: 1, averagePerformance: 70, participatingStudents: 20, examCount: 1 },
        { examId: 'exam-3', examDate: '2026-05-10T00:00:00.000Z', examTitle: 'نصفي ثان', academicYearId: 'year-2', yearLabel: '2026-2027', examTypeId: 'type-a', examTypeName: 'نصفي', sortOrder: 1, averagePerformance: 74, participatingStudents: 19, examCount: 1 },
      ],
    });
    fixture.componentInstance.selectedClassIds.set(['class-a']);

    expect(fixture.componentInstance.comparisonTitle()).toBe('مقارنة أداء الصفوف بمتوسط الطبقة');
    expect(fixture.componentInstance.comparisonChartData().datasets.map((set) => set.label)).toEqual(['نصفي', 'نهائي']);
    expect(fixture.componentInstance.comparisonChartData().labels).toEqual(['الأول أ', 'متوسط المرحلة الأولى']);
    expect(fixture.componentInstance.trendRows().map((row) => row.examId)).toEqual(['exam-1', 'exam-2', 'exam-3']);
    expect(fixture.componentInstance.temporalChartData().datasets[0].data).toEqual([70, null, 74]);
    expect(String(fixture.componentInstance.temporalChartData().labels?.[0])).toContain(year.yearLabel);

    const current = fixture.componentInstance.data()!;
    fixture.componentInstance.data.set({
      ...current,
      options: { ...current.options, examTypes: [current.options.examTypes[0]] },
      byClassExamType: current.byClassExamType.filter((row) => row.examTypeId === 'type-a'),
      byGradeExamType: current.byGradeExamType.filter((row) => row.examTypeId === 'type-a'),
      examTrend: current.examTrend.filter((row) => row.examTypeId === 'type-a'),
    });
    expect(fixture.componentInstance.comparisonChartData().datasets.map((set) => set.label)).toEqual(['نصفي']);
    expect(fixture.componentInstance.temporalChartData().datasets.map((set) => set.label)).toEqual(['نصفي']);
  });

  it('ignores an older dashboard response when a newer filter request finishes first', async () => {
    let resolveOld!: (value: SchoolDashboardData) => void;
    api.nextResult = new Promise((resolve) => { resolveOld = resolve; });
    const oldRequest = fixture.componentInstance.load();
    const newest = { ...dashboard, summary: { ...dashboard.summary, examCount: 2 } };
    api.nextResult = Promise.resolve(newest);

    await fixture.componentInstance.load();
    resolveOld({ ...dashboard, summary: { ...dashboard.summary, examCount: 1 } });
    await oldRequest;

    expect(fixture.componentInstance.data()?.summary.examCount).toBe(2);
  });

  it('renders the deliberate chart empty state when the selected context has no chart data', () => {
    fixture.componentInstance.data.set({ ...dashboard, summary: { ...dashboard.summary, examCount: 1 } });
    fixture.detectChanges();
    const emptyNotes = [...fixture.nativeElement.querySelectorAll('.empty-note')] as HTMLElement[];
    expect(emptyNotes.filter((item) => item.textContent?.trim() === 'لا توجد بيانات كافية لعرض المقارنة ضمن السياق المحدد.')).toHaveLength(2);
  });
});
