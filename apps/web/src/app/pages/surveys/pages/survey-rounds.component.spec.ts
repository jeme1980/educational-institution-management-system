import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { AuthService } from '../../../core/services/auth.service';
import { SurveyWriteError, SurveysApiService } from '../../../core/services/surveys-api.service';
import type { SurveyDetail, SurveyRound, SurveyStructureResponse } from '../models/survey.model';
import { SurveyRoundsComponent } from './survey-rounds.component';

const survey: SurveyDetail = {
  id: 'survey-1', academicYearId: 'year-1', nameAr: 'استبيان الاختبار', nameHe: null,
  descriptionAr: null, descriptionHe: null, audienceType: null, status: 'ACTIVE', isActive: true,
  archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
};
const round = (id: string, sequenceNumber: number): SurveyRound => ({
  id, surveyId: survey.id, academicYearId: survey.academicYearId, code: `ROUND_${id}`,
  nameAr: `جولة ${id}`, nameHe: null, sequenceNumber, startsAt: '2026-02-01T00:00:00.000Z',
  endsAt: '2026-02-28T00:00:00.000Z', measurementDate: '2026-02-15T00:00:00.000Z',
  status: 'PLANNED', closedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
});

describe('SurveyRoundsComponent', () => {
  let fixture: ComponentFixture<SurveyRoundsComponent>;
  const canUpdate = signal(false);
  const getSurveyStructure = vi.fn<(surveyId: string) => Promise<SurveyStructureResponse>>();
  const createSurveyRound = vi.fn();
  const updateSurveyRound = vi.fn();
  const paramMap = convertToParamMap({ surveyId: survey.id });
  const render = async () => {
    fixture = TestBed.createComponent(SurveyRoundsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    canUpdate.set(false);
    getSurveyStructure.mockReset().mockResolvedValue({ survey, sections: [], rounds: [] });
    createSurveyRound.mockReset().mockResolvedValue(round('new', 1));
    updateSurveyRound.mockReset().mockResolvedValue(round('one', 1));
    await TestBed.configureTestingModule({
      imports: [SurveyRoundsComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } },
        { provide: AuthService, useValue: { hasPermission: (permission: string) => permission === 'surveys:update' && canUpdate() } },
        { provide: SurveysApiService, useValue: { getSurveyStructure, createSurveyRound, updateSurveyRound } },
      ],
    }).compileComponents();
  });

  it('uses a surveys:read route and loads survey context and rounds in backend order', async () => {
    expect(routes.find(route => route.path === 'surveys/:surveyId/rounds')?.data?.['requiredPermission']).toBe('surveys:read');
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [round('second', 2), round('first', 1)] });
    await render();
    expect(getSurveyStructure).toHaveBeenCalledWith('survey-1');
    expect(fixture.nativeElement.textContent).toContain(survey.nameAr);
    expect(fixture.debugElement.queryAll(By.css('tbody tr')).map(row => row.nativeElement.textContent)).toEqual([
      expect.stringContaining('جولة second'), expect.stringContaining('جولة first'),
    ]);
    expect(fixture.debugElement.query(By.css('ui-pagination'))).toBeNull();
  });

  it('shows an empty state and hides mutation controls from read-only users', async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد جولات لهذا الاستبيان.');
    expect(fixture.nativeElement.textContent).not.toContain('جولة جديدة');
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [round('one', 1)] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('جولة one');
    expect(fixture.debugElement.query(By.css('ui-table-actions'))).toBeNull();
  });

  it('shows create and edit controls for update permission and blocks archived survey mutations', async () => {
    canUpdate.set(true);
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [round('one', 1)] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('جولة جديدة');
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تعديل جولة one"]'))).not.toBeNull();
    getSurveyStructure.mockResolvedValue({ survey: { ...survey, archivedAt: '2026-03-01T00:00:00.000Z' }, sections: [], rounds: [round('one', 1)] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('جولة جديدة');
    expect(fixture.debugElement.query(By.css('ui-table-actions'))).toBeNull();
  });

  it('creates a round without client year or survey IDs and reloads after success', async () => {
    canUpdate.set(true);
    await render();
    fixture.debugElement.query(By.css('ui-page-header button')).nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[role="dialog"]'))).not.toBeNull();
    expect(Array.from((fixture.debugElement.query(By.css('#round-status select')).nativeElement as HTMLSelectElement).options, option => option.value)).toEqual(['PLANNED', 'OPEN', 'CLOSED']);
    fixture.componentInstance.form.patchValue({ code: 'r1', nameAr: 'الجولة الأولى', sequenceNumber: '1' });
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(createSurveyRound).toHaveBeenCalledWith('survey-1', expect.objectContaining({ code: 'r1', nameAr: 'الجولة الأولى', sequenceNumber: 1, status: 'PLANNED' }));
    expect(createSurveyRound.mock.calls[0][1]).not.toHaveProperty('academicYearId');
    expect(createSurveyRound.mock.calls[0][1]).not.toHaveProperty('surveyId');
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.modalOpen()).toBe(false);
  });

  it('keeps the create modal and fields on a duplicate-code response', async () => {
    canUpdate.set(true);
    createSurveyRound.mockRejectedValue(new SurveyWriteError('DUPLICATE_SURVEY_ROUND_CODE'));
    await render();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ code: 'R1', nameAr: 'اسم محفوظ' });
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(fixture.componentInstance.modalOpen()).toBe(true);
    expect(fixture.componentInstance.form.controls.nameAr.value).toBe('اسم محفوظ');
    expect(fixture.nativeElement.textContent).toContain('مستخدم بالفعل');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('keeps the modal open on backend academic-year date validation', async () => {
    canUpdate.set(true);
    createSurveyRound.mockRejectedValue(new SurveyWriteError('INVALID_SURVEY_ROUND_DATES'));
    await render();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ code: 'R1', nameAr: 'جولة', measurementDate: '2027-02-15' });
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(fixture.componentInstance.modalOpen()).toBe(true);
    expect(fixture.componentInstance.form.controls.measurementDate.value).toBe('2027-02-15');
    expect(fixture.nativeElement.textContent).toContain('ضمن السنة الدراسية');
  });

  it('prefills edit and omits unchanged locked identity fields while saving editable values', async () => {
    canUpdate.set(true);
    const item = { ...round('one', 1), nameHe: 'עברית', status: 'OPEN' as const };
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [item] });
    await render();
    fixture.debugElement.query(By.css('ui-table-actions button')).nativeElement.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.getRawValue()).toEqual(expect.objectContaining({ code: item.code, nameAr: item.nameAr, nameHe: 'עברית', sequenceNumber: '1', startsAt: '2026-02-01', status: 'OPEN' }));
    const select = fixture.debugElement.query(By.css('#round-status select')).nativeElement as HTMLSelectElement;
    expect(Array.from(select.options, option => option.value)).toEqual(['PLANNED', 'OPEN', 'CLOSED']);
    select.value = 'CLOSED';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.componentInstance.save();
    expect(updateSurveyRound).toHaveBeenCalledWith('survey-1', 'one', expect.objectContaining({ status: 'CLOSED', nameAr: item.nameAr }));
    expect(updateSurveyRound.mock.calls[0][2]).not.toHaveProperty('code');
    expect(updateSurveyRound.mock.calls[0][2]).not.toHaveProperty('sequenceNumber');
    expect(updateSurveyRound.mock.calls[0][2]).not.toHaveProperty('academicYearId');
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
  });

  it('rejects inverted dates locally and preserves the modal on history-lock conflict', async () => {
    canUpdate.set(true);
    updateSurveyRound.mockRejectedValue(new SurveyWriteError('SURVEY_STRUCTURE_LOCKED'));
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [round('one', 1)] });
    await render();
    fixture.componentInstance.openEdit(round('one', 1));
    fixture.componentInstance.form.patchValue({ startsAt: '2026-03-01', endsAt: '2026-02-01', code: 'NEW_CODE' });
    await fixture.componentInstance.save();
    expect(updateSurveyRound).not.toHaveBeenCalled();
    fixture.componentInstance.form.patchValue({ endsAt: '2026-03-31' });
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(fixture.componentInstance.modalOpen()).toBe(true);
    expect(fixture.componentInstance.form.controls.code.value).toBe('NEW_CODE');
    expect(fixture.nativeElement.textContent).toContain('بعد تسجيل نتائج');
  });

  it('shows a safe loading error and retries', async () => {
    getSurveyStructure.mockRejectedValueOnce(new Error('private database failure')).mockResolvedValueOnce({ survey, sections: [], rounds: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('تعذر تحميل جولات الاستبيان');
    expect(fixture.nativeElement.textContent).not.toContain('private database failure');
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('لا توجد جولات');
  });
});
