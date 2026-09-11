import { SimpleChange, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
