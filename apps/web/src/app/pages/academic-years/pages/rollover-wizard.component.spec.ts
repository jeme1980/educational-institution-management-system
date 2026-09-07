import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { RolloverApiService, RolloverDraft } from '../services/rollover-api.service';
import { RolloverWizardComponent } from './rollover-wizard.component';

const draftId = '04bbfa30-051e-4bf7-a388-1b7eedc8b179';
const draft = {
  operation: { id: draftId, status: 'DRAFT' }, sourceYear: { id: 'source', yearLabel: '2025-2026', isCurrent: true, isClosed: false, startDate: '2025-09-01' }, targetYear: { id: 'target', yearLabel: '2026-2027', isCurrent: false, isClosed: false, startDate: '2026-09-01' }, classMappings: [],
  executionPlanFingerprint: 'a'.repeat(64),
  dependencies: { subjects: { summary: {} }, specializations: { summary: {}, sourceBasis: '' }, staffAssignments: { summary: {} }, topics: { sourceCount: 0 }, skills: { sourceCount: 0 }, studyGroups: { sourceCount: 0 } },
  studentDecisions: { summary: { total: 401, promote: 401 }, items: [] }, readiness: { canExecute: false, blockers: ['MISSING_TARGET_PERIODS'], warnings: [], targetPeriodsReady: false },
} satisfies RolloverDraft;

describe('RolloverWizardComponent startDraft', () => {
  const navigate = vi.fn(async () => true);
  const createDraft = vi.fn();
  const getDraft = vi.fn(async () => ({ status: 200, body: draft }));
  const executeAcademicYearRollover = vi.fn();
  let component: RolloverWizardComponent;

  beforeEach(() => {
    navigate.mockClear(); createDraft.mockReset(); getDraft.mockClear(); executeAcademicYearRollover.mockReset();
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: { academicYears: signal([]), loadAcademicYears: vi.fn() } },
      { provide: RolloverApiService, useValue: { createDraft, getDraft, executeAcademicYearRollover } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null }, queryParamMap: { get: () => null } } } },
      { provide: Router, useValue: { navigate } },
      { provide: ConfirmDialogService, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new RolloverWizardComponent());
  });

  it('resumes only an ACTIVE_DRAFT_EXISTS response and loads the stored draft', async () => {
    vi.useFakeTimers();
    createDraft.mockResolvedValue({ status: 409, body: { code: 'ACTIVE_DRAFT_EXISTS', existingRolloverId: draftId } });
    await component.startDraft();
    expect(getDraft).toHaveBeenCalledWith(draftId);
    expect(navigate).toHaveBeenCalledWith(['/academic-years/rollover', draftId], { queryParams: { resumed: '1' } });
    expect(component.draft()?.operation.id).toBe(draftId);
    expect(component.notice()).toBe('يوجد إعداد ترفيع محفوظ بالفعل لهذا الزوج، تم فتحه.');
    expect(component.error()).toBe('');
    expect(component.loading()).toBe(false);
    vi.advanceTimersByTime(3500);
    expect(component.notice()).toBe('');
    vi.useRealTimers();
  });

  it.each([{ status: 409, body: { code: 'OTHER_CONFLICT', existingRolloverId: draftId } }, { status: 500, body: { error: 'failed' } }])('keeps generic feedback for an unhandled response', async response => {
    createDraft.mockResolvedValue(response);
    await component.startDraft();
    expect(getDraft).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.error()).toBe('تعذر بدء إعداد الترفيع.');
  });

  it('navigates blockers to class and unresolved student review', () => {
    component.step.set(5);
    component.blockerAction('CLASS_MAPPING_CONFLICTS');
    expect(component.step()).toBe(2);
    component.blockerAction('UNRESOLVED_STUDENT_DECISIONS');
    expect(component.step()).toBe(4);
    expect(component.statusFilter()).toBe('UNRESOLVED');
  });

  it('maps semantic labels and human-readable target classes', () => {
    const decision = { action: 'PROMOTE', targetClassMapping: { targetParallelNumber: 3 } } as unknown as RolloverDraft['studentDecisions']['items'][number];
    expect(component.statusLabel('VALID')).toBe('جاهز');
    expect(component.statusLabel('CONFLICT')).toBe('تعارض');
    expect(component.targetClassLabel(decision)).toBe('شعبة 3');
    decision.action = 'SKIP';
    expect(component.targetClassLabel(decision)).toBe('غير مطلوب');
    const mapping = { id: 'mapping-1', action: 'SKIP', validationStatus: 'UNRESOLVED' } as RolloverDraft['classMappings'][number];
    expect(component.classStatusLabel(mapping)).toBe('يحتاج معالجة الطلاب');
  });

  it('tracks filtered selection for the conditional bulk toolbar', () => {
    component.toggle('student-1', true);
    expect(component.selected().size).toBe(1);
    component.clearSelection();
    expect(component.selected().size).toBe(0);
  });

  it('exposes execute only for a ready draft on step 5 with a valid fingerprint', () => {
    component.step.set(4);
    expect(component.canGoNext()).toBe(true);
    component.step.set(5);
    expect(component.canGoNext()).toBe(false);
    component.draft.set(draft);
    expect(component.executeAvailable()).toBe(false);
    component.draft.set({ ...draft, readiness: { ...draft.readiness, canExecute: true, blockers: [] } });
    expect(component.executeAvailable()).toBe(true);
  });

  it('requires an exact target-year confirmation before executing once', async () => {
    component.step.set(5);
    component.draft.set({ ...draft, readiness: { ...draft.readiness, canExecute: true, blockers: [] } });
    component.openExecuteConfirmation();
    expect(executeAcademicYearRollover).not.toHaveBeenCalled();
    component.executeConfirmation.set('2026-2027 ');
    expect(component.confirmationMatches()).toBe(true);
    executeAcademicYearRollover.mockResolvedValue({ status: 200, body: {
      rolloverId: draftId, status: 'COMPLETED', alreadyCompleted: false,
      sourceYear: draft.sourceYear, targetYear: draft.targetYear,
      result: { classes: { created: 1, reused: 0 }, subjects: { created: 1, reused: 0 }, topics: { created: 0, reused: 0 }, skills: { created: 0, reused: 0 }, specializations: { relationsCreated: 0, reused: 0 }, staffAssignments: { created: 0, reused: 0 }, enrollments: { created: 401, reused: 0 }, decisions: { promoted: 401, repeated: 0, graduated: 0, skipped: 0 } },
      policy: { sourceMutated: false, currentYearChanged: false, historicalRecordsCopied: false, studyGroupsCopied: false },
    } });
    const first = component.executeRollover();
    const second = component.executeRollover();
    await Promise.all([first, second]);
    expect(executeAcademicYearRollover).toHaveBeenCalledTimes(1);
    expect(executeAcademicYearRollover).toHaveBeenCalledWith(draftId, 'a'.repeat(64));
    expect(component.completed()).toBe(true);
    expect(component.executeConfirmationOpen()).toBe(false);
  });

  it('refreshes a changed plan and asks for manual status refresh when execution is uncertain', async () => {
    component.step.set(5);
    component.draft.set({ ...draft, readiness: { ...draft.readiness, canExecute: true, blockers: [] } });
    component.executeConfirmation.set('2026-2027');
    executeAcademicYearRollover.mockResolvedValueOnce({ status: 409, body: { code: 'ROLLOVER_PLAN_CHANGED' } });
    await component.executeRollover();
    expect(getDraft).toHaveBeenCalledWith(draftId);
    expect(component.error()).toContain('تغيرت بيانات');

    component.draft.set({ ...draft, readiness: { ...draft.readiness, canExecute: true, blockers: [] } });
    component.executeConfirmation.set('2026-2027');
    executeAcademicYearRollover.mockRejectedValueOnce(new Error('network'));
    await component.executeRollover();
    expect(component.executionNeedsRefresh()).toBe(true);
    expect(component.error()).toContain('حدّث حالة العملية');
  });
});
