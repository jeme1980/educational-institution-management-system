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
  bySubject: [], byClass: [], byGrade: [], byExamType: [],
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
});
