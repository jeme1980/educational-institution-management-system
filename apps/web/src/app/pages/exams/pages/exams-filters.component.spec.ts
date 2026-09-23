import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, ExamItem } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ExamsStateService } from '../services/exams-state.service';
import { EXAM_FILTER_ALL, ExamsComponent } from './exams.component';

const group = (studyGroupId: string, classId: string, gradeLevelId: string, teacherId: string, teacherName: string) => ({
  studyGroupId,
  studyGroup: {
    classId,
    staffAssignmentId: `assignment-${teacherId}`,
    classRoom: { id: classId, nameAr: `صف ${classId}`, gradeLevelId, gradeLevel: { id: gradeLevelId, nameAr: `طبقة ${gradeLevelId}` } },
    staffAssignment: { id: `assignment-${teacherId}`, staffMemberId: teacherId, staffMember: { id: teacherId, firstNameAr: teacherName, familyNameAr: 'المعلم' } },
  },
});

const exam = (id: string, subjectId: string, periodId: string, examTypeId: string, groups: ReturnType<typeof group>[]): ExamItem => ({
  id, institutionId: 'institution-1', academicYearId: 'year-1', subjectId, academicPeriodId: periodId, examTypeId,
  titleAr: `امتحان ${id}`, examDate: '2026-01-01', maxScore: 100, isPublished: false,
  subject: { id: subjectId, nameAr: `موضوع ${subjectId}` }, academicPeriod: { id: periodId, nameAr: `فترة ${periodId}` }, examType: { id: examTypeId, nameAr: `نوع ${examTypeId}` }, examGroups: groups,
  _count: { examGroups: groups.length, examQuestions: 0, studentExamResults: 0 }, metrics: { expectedStudents: 0, recordedStudents: 0 },
});

describe('ExamsComponent management filters', () => {
  const exams = [
    exam('A', 'subject-1', 'period-1', 'type-1', [group('group-1', 'class-1', 'grade-5', 'teacher-1', 'أحمد'), group('group-2', 'class-2', 'grade-5', 'teacher-2', 'سليم')]),
    exam('B', 'subject-2', 'period-2', 'type-2', [group('group-3', 'class-3', 'grade-6', 'teacher-3', 'ليلى')]),
    exam('C', 'subject-1', 'period-2', 'type-1', [group('group-4', 'class-1', 'grade-5', 'teacher-2', 'سليم')]),
  ];
  let api: any;
  let state: any;

  beforeEach(() => {
    api = {
      selectedAcademicYearId: signal('year-1'),
      subjects: signal([{ id: 'subject-1', nameAr: 'الإنجليزية' }, { id: 'subject-2', nameAr: 'الرياضيات' }]),
      academicPeriods: signal([{ id: 'period-1', nameAr: 'الفصل الأول' }, { id: 'period-2', nameAr: 'الفصل الثاني' }]),
      examTypes: signal([{ id: 'type-1', nameAr: 'مسح بداية السنة', isActive: true }]),
      questionTypes: signal([]), examsApi: { error: signal('') },
      loadExamTypes: vi.fn(), loadQuestionTypes: vi.fn(), loadAcademicPeriods: vi.fn(), loadSubjects: vi.fn(),
    };
    state = {
      exams: signal(exams), studyGroups: signal([]),
      classes: signal([
        { id: 'class-1', nameAr: 'الخامس أ', gradeLevelId: 'grade-5', gradeLevelInfo: { id: 'grade-5', nameAr: 'الخامس' } },
        { id: 'class-2', nameAr: 'الخامس ب', gradeLevelId: 'grade-5', gradeLevelInfo: { id: 'grade-5', nameAr: 'الخامس' } },
        { id: 'class-3', nameAr: 'السادس أ', gradeLevelId: 'grade-6', gradeLevelInfo: { id: 'grade-6', nameAr: 'السادس' } },
      ]),
      loadExams: vi.fn(), loadClasses: vi.fn(), loadStudyGroups: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [ExamsComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }, { provide: ExamsStateService, useValue: state }, { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } }],
    });
  });

  it('renders all eight filters in the compact grid with explicit All options and no pagination', () => {
    const fixture = TestBed.createComponent(ExamsComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    const filterGrid = fixture.nativeElement.querySelector('.exam-filter-grid');
    expect(filterGrid).toBeTruthy();
    expect(filterGrid.querySelectorAll('.filter-field')).toHaveLength(8);
    for (const label of ['البحث', 'الموضوع', 'الطبقة', 'الصف', 'المعلم', 'الفترة', 'نوع الامتحان', 'الحالة']) expect(text).toContain(label);
    for (const option of ['كل المواضيع', 'كل الطبقات', 'كل الصفوف', 'كل المعلمين', 'كل الفترات', 'كل أنواع الامتحانات', 'كل الحالات']) expect(text).toContain(option);
    expect(filterGrid.querySelector('.filter-field--search')).toBeTruthy();
    expect(text).toContain('عدد النتائج: 3');
    expect(text).not.toContain('تحميل المزيد');
    expect(text).not.toContain('من أصل');
  });

  it('filters by search and status, then clears all active filters from the compact action', () => {
    const fixture = TestBed.createComponent(ExamsComponent);
    const component = fixture.componentInstance;
    component.search.set('امتحان A');
    component.setFilter('published', 'false');
    fixture.detectChanges();
    expect(component.filteredExams().map(item => item.id)).toEqual(['A']);
    expect(fixture.nativeElement.textContent).toContain('عدد النتائج: 1');
    const clearButton = [...fixture.nativeElement.querySelectorAll('button')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('مسح التصفية')) as HTMLButtonElement;
    expect(clearButton).toBeTruthy();
    clearButton.click();
    fixture.detectChanges();
    expect(component.filteredExams()).toEqual(exams);
    expect(component.search()).toBe('');
    expect(component.publishedFilter()).toBe(EXAM_FILTER_ALL);
    expect(fixture.nativeElement.textContent).not.toContain('مسح التصفية');
  });

  it('filters by real subject, period, and exam type IDs', () => {
    const component = TestBed.createComponent(ExamsComponent).componentInstance;
    component.setFilter('subject', 'subject-1');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A', 'C']);
    component.setFilter('period', 'period-1');
    component.setFilter('examType', 'type-1');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A']);
  });

  it('uses every linked group for grade, class, and teacher matching', () => {
    const component = TestBed.createComponent(ExamsComponent).componentInstance;
    component.setFilter('class', 'class-1');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A', 'C']);
    component.setFilter('class', 'class-2');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A']);
    component.setFilter('teacher', 'teacher-2');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A']);
    component.setFilter('class', 'class-3');
    expect(component.filteredExams()).toEqual([]);
    component.clearFilters();
    component.setFilter('teacher', 'teacher-1');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A']);
    component.setFilter('teacher', 'teacher-2');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A', 'C']);
    component.setFilter('grade', 'grade-6');
    expect(component.filteredExams()).toEqual([]);
  });

  it('filters class options by grade and clears a stale real class ID', () => {
    const component = TestBed.createComponent(ExamsComponent).componentInstance;
    component.setFilter('grade', 'grade-5');
    expect(component.visibleClassOptions().map(item => item.id)).toEqual(['class-1', 'class-2']);
    component.setFilter('class', 'class-1');
    component.setFilter('grade', 'grade-6');
    expect(component.visibleClassOptions().map(item => item.id)).toEqual(['class-3']);
    expect(component.classFilter()).toBe(EXAM_FILTER_ALL);
  });

  it('does not treat the first real class option as All', () => {
    const component = TestBed.createComponent(ExamsComponent).componentInstance;
    const firstClassId = component.classOptions()[0].id;
    component.setFilter('class', firstClassId);
    expect(component.filteredExams().length).toBeLessThan(exams.length);
  });

  it('composes all filters with AND and clear restores the complete source list', () => {
    const component = TestBed.createComponent(ExamsComponent).componentInstance;
    component.setFilter('subject', 'subject-1');
    component.setFilter('grade', 'grade-5');
    component.setFilter('class', 'class-2');
    component.setFilter('teacher', 'teacher-2');
    component.setFilter('period', 'period-1');
    component.setFilter('examType', 'type-1');
    expect(component.filteredExams().map(item => item.id)).toEqual(['A']);
    component.clearFilters();
    expect(component.filteredExams()).toEqual(exams);
    expect(component.subjectFilter()).toBe(EXAM_FILTER_ALL);
  });

  it('keeps an inactive historical exam type available from the exam dataset', () => {
    const component = TestBed.createComponent(ExamsComponent).componentInstance;
    expect(component.examTypeOptions()).toContainEqual({ id: 'type-2', nameAr: 'نوع type-2' });
  });

  it('resets year-scoped selections and reloads data when the global academic year changes', async () => {
    const fixture = TestBed.createComponent(ExamsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.setFilter('subject', 'subject-1');
    component.setFilter('grade', 'grade-5');
    component.setFilter('class', 'class-1');
    component.setFilter('teacher', 'teacher-1');
    component.setFilter('period', 'period-1');
    component.setFilter('examType', 'type-1');
    api.selectedAcademicYearId.set('year-2');
    TestBed.flushEffects();
    await Promise.resolve();
    expect([component.subjectFilter(), component.gradeFilter(), component.classFilter(), component.teacherFilter(), component.academicPeriodFilter()]).toEqual(Array(5).fill(EXAM_FILTER_ALL));
    expect(component.examTypeFilter()).toBe('type-1');
    expect(state.loadExams).toHaveBeenCalledTimes(2);
    expect(state.loadClasses).toHaveBeenCalledTimes(2);
  });
});
