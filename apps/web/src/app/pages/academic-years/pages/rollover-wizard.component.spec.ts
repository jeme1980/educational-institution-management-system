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
  dependencies: { subjects: { summary: {} }, specializations: { summary: {}, sourceBasis: '' }, staffAssignments: { summary: {} }, topics: { sourceCount: 0 }, skills: { sourceCount: 0 }, studyGroups: { sourceCount: 0 } },
  studentDecisions: { summary: { total: 401, promote: 401 }, items: [] }, readiness: { canExecute: false, blockers: ['MISSING_TARGET_PERIODS'], warnings: [], targetPeriodsReady: false },
} satisfies RolloverDraft;

describe('RolloverWizardComponent startDraft', () => {
  const navigate = vi.fn(async () => true);
  const createDraft = vi.fn();
  const getDraft = vi.fn(async () => ({ status: 200, body: draft }));
  let component: RolloverWizardComponent;

  beforeEach(() => {
    navigate.mockClear(); createDraft.mockReset(); getDraft.mockClear();
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: { academicYears: signal([]), loadAcademicYears: vi.fn() } },
      { provide: RolloverApiService, useValue: { createDraft, getDraft } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null }, queryParamMap: { get: () => null } } } },
      { provide: Router, useValue: { navigate } },
      { provide: ConfirmDialogService, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new RolloverWizardComponent());
  });

  it('resumes only an ACTIVE_DRAFT_EXISTS response and loads the stored draft', async () => {
    createDraft.mockResolvedValue({ status: 409, body: { code: 'ACTIVE_DRAFT_EXISTS', existingRolloverId: draftId } });
    await component.startDraft();
    expect(getDraft).toHaveBeenCalledWith(draftId);
    expect(navigate).toHaveBeenCalledWith(['/academic-years/rollover', draftId], { queryParams: { resumed: '1' } });
    expect(component.draft()?.operation.id).toBe(draftId);
    expect(component.notice()).toBe('يوجد إعداد ترفيع محفوظ بالفعل لهذا الزوج، تم فتحه.');
    expect(component.error()).toBe('');
    expect(component.loading()).toBe(false);
  });

  it.each([{ status: 409, body: { code: 'OTHER_CONFLICT', existingRolloverId: draftId } }, { status: 500, body: { error: 'failed' } }])('keeps generic feedback for an unhandled response', async response => {
    createDraft.mockResolvedValue(response);
    await component.startDraft();
    expect(getDraft).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.error()).toBe('تعذر بدء إعداد الترفيع.');
  });
});
