import { SimpleChange, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ExamsApiService } from '../../../core/services/exams-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ExamsStateService } from '../services/exams-state.service';
import { ExamsComponent } from '../pages/exams.component';
import { ExamResultsDialogComponent } from './exam-results-dialog';

const question = { id: 'question-1', questionNumber: 1, maxScore: 20 };
const presentResult = {
  studentId: 'student-1',
  studentName: 'طالب',
  nationalId: '123',
  classNameAr: 'الصف',
  resultId: 'result-1',
  totalScore: 12,
  isAbsence: false,
  questionScores: [{ questionId: question.id, score: 12, notes: '' }],
};

describe('ExamResultsDialogComponent absence editing', () => {
  let fixture: ComponentFixture<ExamResultsDialogComponent>;
  let component: ExamResultsDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExamResultsDialogComponent],
      providers: [{ provide: ApiService, useValue: {} }],
    }).compileComponents();
    fixture = TestBed.createComponent(ExamResultsDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('exam', { id: 'exam-1', maxScore: 20 });
    fixture.componentRef.setInput('questions', [question]);
    fixture.componentRef.setInput('results', [presentResult]);
    fixture.detectChanges();
  });

  it('keeps existing scores locally while absence is toggled and restores editing when unmarked', () => {
    const row = component.drafts()[0];
    component.toggleAbsence(row, { target: { checked: true } } as unknown as Event);
    fixture.detectChanges();

    expect(row.isAbsence).toBe(true);
    expect(row.questionScores[0].score).toBe(12);
    expect(component.dirty()).toBe(true);
    expect((fixture.nativeElement.querySelector('[data-grade-cell]') as HTMLInputElement).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('غائب');

    component.scoreInput(row, question, { target: { value: '18' } } as unknown as Event);
    expect(row.questionScores[0].score).toBe(12);

    component.toggleAbsence(row, { target: { checked: false } } as unknown as Event);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('[data-grade-cell]') as HTMLInputElement).disabled).toBe(false);
  });

  it('reflects persisted absence from the server in the checkbox and disables score inputs', () => {
    fixture.componentRef.setInput('results', [{ ...presentResult, isAbsence: true, totalScore: 0, questionScores: [{ questionId: question.id, score: null }] }]);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect((fixture.nativeElement.querySelector('[data-grade-cell]') as HTMLInputElement).disabled).toBe(true);
    expect(component.dirty()).toBe(false);
  });

  it('emits one save for a double click and blocks saving while already saving', () => {
    const emitted = vi.fn();
    component.saved.subscribe(emitted);
    component.toggleAbsence(component.drafts()[0], { target: { checked: true } } as unknown as Event);

    component.save();
    component.save();
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0][0][0].isAbsence).toBe(true);

    component.ngOnChanges({ saving: new SimpleChange(true, false, false) });
    component.saving = true;
    component.save();
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('replaces the full draft from a server refresh while preserving search and clearing dirty state', () => {
    component.search.set('123');
    component.toggleAbsence(component.drafts()[0], { target: { checked: true } } as unknown as Event);
    const serverResult = { ...presentResult, totalScore: 18, questionScores: [{ questionId: question.id, score: 18 }] };
    component.results = [serverResult];
    component.ngOnChanges({ results: new SimpleChange([presentResult], [serverResult], false) });

    expect(component.drafts()[0].totalScore).toBe(18);
    expect(component.drafts()[0].isAbsence).toBe(false);
    expect(component.search()).toBe('123');
    expect(component.dirty()).toBe(false);
    expect(component.savePending()).toBe(false);
  });

  it('retains edits and unlocks retry when a save attempt fails', () => {
    const row = component.drafts()[0];
    component.toggleAbsence(row, { target: { checked: true } } as unknown as Event);
    component.save();
    component.saving = false;
    component.ngOnChanges({ saving: new SimpleChange(true, false, false) });

    expect(component.drafts()[0].isAbsence).toBe(true);
    expect(component.dirty()).toBe(true);
    expect(component.savePending()).toBe(false);
  });

  it('keeps a hidden dirty row and emits only that row', () => {
    const second = { ...presentResult, studentId: 'student-2', studentName: 'طالب آخر', nationalId: '456' };
    component.results = [presentResult, second];
    component.ngOnChanges({ results: new SimpleChange([presentResult], [presentResult, second], false) });
    component.scoreInput(component.drafts()[0], question, { target: { value: '2' } } as unknown as Event);
    component.search.set('456');
    const emitted = vi.fn();
    component.saved.subscribe(emitted);
    component.save();

    expect(component.filteredStudents().map(row => row.studentId)).toEqual(['student-2']);
    expect(emitted.mock.calls[0][0]).toHaveLength(1);
    expect(emitted.mock.calls[0][0][0].questionScores[0].score).toBe(2);
  });

  it('emits only the three changed students from a larger result set', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ ...presentResult, studentId: `student-${index + 1}` }));
    component.results = rows;
    component.ngOnChanges({ results: new SimpleChange([presentResult], rows, false) });
    component.scoreInput(component.drafts()[0], question, { target: { value: '1' } } as unknown as Event);
    component.scoreInput(component.drafts()[2], question, { target: { value: '2' } } as unknown as Event);
    component.toggleAbsence(component.drafts()[5], { target: { checked: true } } as unknown as Event);
    const emitted = vi.fn();
    component.saved.subscribe(emitted);
    component.save();

    expect(emitted.mock.calls[0][0].map((row: any) => row.studentId)).toEqual(['student-1', 'student-3', 'student-6']);
  });

  it('does not emit a save when no row changed', () => {
    const emitted = vi.fn();
    component.saved.subscribe(emitted);
    component.save();

    expect(emitted).not.toHaveBeenCalled();
    expect(component.dirty()).toBe(false);
  });

  it('keeps multiple edited scores mapped to their question IDs and recalculates total', () => {
    const secondQuestion = { id: 'question-2', questionNumber: 2, maxScore: 20 };
    component.questions = [question, secondQuestion];
    const row = component.drafts()[0];
    component.scoreInput(row, question, { target: { value: '2' } } as unknown as Event);
    component.scoreInput(row, secondQuestion, { target: { value: '4.5' } } as unknown as Event);

    expect(row.questionScores).toEqual([
      expect.objectContaining({ questionId: 'question-1', score: 2 }),
      expect.objectContaining({ questionId: 'question-2', score: 4.5 }),
    ]);
    expect(row.totalScore).toBe(6.5);
  });
});

describe('ExamsComponent result persistence', () => {
  function createComponent(options: { save?: boolean; refreshed?: any } = {}) {
    const order: string[] = [];
    const api = {
      examResultsSaveError: signal(''),
      saveExamResults: vi.fn().mockImplementation(async () => { order.push('POST'); return options.save ?? true; }),
      loadExamResults: vi.fn().mockImplementation(async () => { order.push('GET'); return options.refreshed === undefined ? { results: [{ ...presentResult, totalScore: 17 }], questions: [question] } : options.refreshed; }),
      loadExamTypes: vi.fn().mockResolvedValue(true),
      loadQuestionTypes: vi.fn().mockResolvedValue(true),
      loadAcademicPeriods: vi.fn().mockResolvedValue(true),
      loadSubjects: vi.fn().mockResolvedValue(true),
    };
    const state = {
      exams: signal([]),
      studyGroups: signal([]),
      loadExams: vi.fn().mockResolvedValue(true),
      loadStudyGroups: vi.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: ExamsStateService, useValue: state },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new ExamsComponent());
    component.selectedExam.set({ id: 'exam-1' } as any);
    component.results.set([presentResult]);
    return { component, api, order };
  }

  it('posts explicit absence, strips scores for the server contract, then refetches authoritative results', async () => {
    const { component, api, order } = createComponent();
    await component.saveResultsFromDialog([{ ...presentResult, isAbsence: true }]);

    expect(api.saveExamResults).toHaveBeenCalledWith('exam-1', [expect.objectContaining({ isAbsence: true, totalScore: 0, questionScores: [] })]);
    expect(order).toEqual(['POST', 'GET']);
    expect(component.results()[0].totalScore).toBe(17);
    expect(component.toast()?.type).toBe('success');
  });

  it('posts a minimal result DTO without display-only student data', async () => {
    const { component, api } = createComponent();
    await component.saveResultsFromDialog([presentResult]);

    const payload = api.saveExamResults.mock.calls[0][1][0];
    expect(payload).toEqual({
      studentId: 'student-1',
      isAbsence: false,
      totalScore: 12,
      absenceReason: null,
      notes: null,
      questionScores: [{ questionId: 'question-1', score: 12, notes: null }],
    });
    expect(JSON.stringify(payload)).not.toContain('studentName');
    expect(JSON.stringify(payload)).not.toContain('nationalId');
    expect(JSON.stringify(payload)).not.toContain('classNameAr');
  });

  it('sends the latest score through the real DOM input and Save All click', async () => {
    const { api } = createComponent();
    const fixture = TestBed.createComponent(ExamsComponent);
    const page = fixture.componentInstance;
    page.selectedExam.set({ id: 'exam-1', maxScore: 20 } as any);
    page.results.set([{ ...presentResult, totalScore: 3, questionScores: [{ questionId: question.id, score: 3 }] }]);
    page.resultQuestions.set([question]);
    page.isLoadingResults.set(false);
    page.showResultsPanel.set(true);
    fixture.detectChanges();

    const dialog = fixture.debugElement.query(By.directive(ExamResultsDialogComponent)).componentInstance as ExamResultsDialogComponent;
    const input = fixture.nativeElement.querySelector('[data-grade-cell]') as HTMLInputElement;
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(input.value).toBe('2');
    expect(dialog.drafts()[0].questionScores).toContainEqual(expect.objectContaining({ questionId: question.id, score: 2 }));
    expect(dialog.drafts()[0].totalScore).toBe(2);

    const saveButton = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button: any) => button.textContent.includes('حفظ جميع النتائج')) as HTMLButtonElement;
    saveButton.click();

    await vi.waitFor(() => expect(api.saveExamResults).toHaveBeenCalled());
    expect(api.saveExamResults.mock.calls[0][1][0]).toMatchObject({
      studentId: 'student-1',
      isAbsence: false,
      totalScore: 2,
      questionScores: [{ questionId: question.id, score: 2 }],
    });
    await vi.waitFor(() => expect(api.loadExamResults).toHaveBeenCalled());
  });

  it('sends present-to-absent from the real checkbox used by Save All', async () => {
    const { api } = createComponent();
    const fixture = TestBed.createComponent(ExamsComponent);
    const page = fixture.componentInstance;
    page.selectedExam.set({ id: 'exam-1', maxScore: 20 } as any);
    page.results.set([presentResult]);
    page.resultQuestions.set([question]);
    page.isLoadingResults.set(false);
    page.showResultsPanel.set(true);
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const saveButton = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button: any) => button.textContent.includes('حفظ جميع النتائج')) as HTMLButtonElement;
    saveButton.click();

    await vi.waitFor(() => expect(api.saveExamResults).toHaveBeenCalled());
    expect(api.saveExamResults.mock.calls[0][1][0]).toMatchObject({
      studentId: 'student-1',
      isAbsence: true,
      totalScore: 0,
      questionScores: [],
    });
  });

  it('sends absent-to-present with newly entered scores from the same DOM draft', async () => {
    const { api } = createComponent();
    const fixture = TestBed.createComponent(ExamsComponent);
    const page = fixture.componentInstance;
    page.selectedExam.set({ id: 'exam-1', maxScore: 20 } as any);
    page.results.set([{ ...presentResult, isAbsence: true, totalScore: 0, questionScores: [{ questionId: question.id, score: null }] }]);
    page.resultQuestions.set([question]);
    page.isLoadingResults.set(false);
    page.showResultsPanel.set(true);
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('[data-grade-cell]') as HTMLInputElement;
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const saveButton = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button: any) => button.textContent.includes('حفظ جميع النتائج')) as HTMLButtonElement;
    saveButton.click();

    await vi.waitFor(() => expect(api.saveExamResults).toHaveBeenCalled());
    expect(api.saveExamResults.mock.calls[0][1][0]).toMatchObject({
      studentId: 'student-1',
      isAbsence: false,
      totalScore: 4,
      questionScores: [expect.objectContaining({ questionId: question.id, score: 4 })],
    });
  });

  it('does not refetch after a failed save and keeps the current authoritative state', async () => {
    const { component, api } = createComponent({ save: false });
    await component.saveResultsFromDialog([{ ...presentResult, isAbsence: true }]);

    expect(api.loadExamResults).not.toHaveBeenCalled();
    expect(component.results()[0].isAbsence).toBe(false);
    expect(component.isSavingResults()).toBe(false);
    expect(component.toast()?.message).toContain('بقيت تعديلاتك');
  });

  it('reports that save succeeded when the required refresh fails', async () => {
    const { component } = createComponent({ refreshed: null });
    await component.saveResultsFromDialog([{ ...presentResult, totalScore: 15 }]);

    expect(component.results()[0].totalScore).toBe(12);
    expect(component.toast()?.type).toBe('error');
    expect(component.toast()?.message).toContain('تم حفظ النتائج');
    expect(component.toast()?.message).toContain('تعذر تحديثها');
  });
});

describe('ExamsApiService result errors', () => {
  it('keeps a structured backend error message for the results screen', async () => {
    TestBed.configureTestingModule({
      providers: [
        ExamsApiService,
        provideRouter([]),
        { provide: AuthService, useValue: { idToken: signal('token'), waitForAuthInit: vi.fn() } },
      ],
    });
    const service = TestBed.inject(ExamsApiService);
    vi.spyOn(service, 'apiFetch').mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'علامة السؤال غير صالحة.' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(service.saveExamResults('exam-1', [])).resolves.toBe(false);
    expect(service.examResultsSaveError()).toBe('علامة السؤال غير صالحة.');
  });
});
