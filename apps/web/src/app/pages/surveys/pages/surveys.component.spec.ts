import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { SurveysApiService } from '../../../core/services/surveys-api.service';
import type { SurveyListItem } from '../models/survey.model';
import { SurveysComponent } from './surveys.component';

const survey = (id: string, status: SurveyListItem['status']): SurveyListItem => ({
  id,
  academicYearId: 'year-a',
  nameAr: `استبيان ${id}`,
  nameHe: null,
  descriptionAr: null,
  descriptionHe: null,
  audienceType: null,
  status,
  isActive: true,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  sectionCount: 0,
  domainCount: 0,
  indicatorCount: 0,
  roundCount: 2,
  segmentCount: 0,
});

describe('SurveysComponent', () => {
  let fixture: ComponentFixture<SurveysComponent>;
  const selectedAcademicYearId = signal<string | null>('year-a');
  const academicYears = signal([{ id: 'year-a', yearLabel: '2025/2026' }, { id: 'year-b', yearLabel: '2026/2027' }]);
  const getSurveys = vi.fn<(yearId: string) => Promise<SurveyListItem[]>>();
  const createSurvey = vi.fn();
  const updateSurvey = vi.fn();
  const canUpdate = signal(false);
  const canRead = signal(true);

  const render = async () => {
    fixture = TestBed.createComponent(SurveysComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    selectedAcademicYearId.set('year-a');
    getSurveys.mockReset();
    getSurveys.mockResolvedValue([]);
    createSurvey.mockReset();
    createSurvey.mockResolvedValue({});
    updateSurvey.mockReset();
    updateSurvey.mockResolvedValue({});
    canUpdate.set(false);
    canRead.set(true);
    await TestBed.configureTestingModule({
      imports: [SurveysComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { selectedAcademicYearId, academicYears } },
        { provide: AuthService, useValue: { hasPermission: (permission: string) => (permission === 'surveys:update' && canUpdate()) || (permission === 'surveys:read' && canRead()) } },
        { provide: SurveysApiService, useValue: { getSurveys, createSurvey, updateSurvey } },
      ],
    }).compileComponents();
  });

  it('loads the selected academic year and renders real list fields and statuses', async () => {
    getSurveys.mockResolvedValue([survey('one', 'DRAFT'), survey('two', 'ACTIVE'), survey('three', 'CLOSED')]);
    await render();
    expect(getSurveys).toHaveBeenCalledWith('year-a');
    expect(fixture.nativeElement.textContent).toContain('2025/2026');
    expect(fixture.debugElement.queryAll(By.css('tbody tr'))).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('استبيان one');
    expect(fixture.debugElement.queryAll(By.css('ui-badge')).map(item => item.nativeElement.textContent.trim())).toEqual(['مسودة', 'نشط', 'مغلق']);
    expect(fixture.nativeElement.textContent).toContain('2');
    expect(fixture.debugElement.query(By.css('ui-pagination'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('تحميل المزيد');
  });

  it('shows the year empty state when the API returns no surveys', async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد استبيانات لهذه السنة الدراسية.');
    expect(fixture.debugElement.query(By.css('table'))).toBeNull();
  });

  it('shows a safe error and retries the request', async () => {
    getSurveys.mockRejectedValueOnce(new Error('private backend details')).mockResolvedValueOnce([survey('one', 'ACTIVE')]);
    await render();
    expect(fixture.nativeElement.textContent).toContain('تعذر تحميل الاستبيانات');
    expect(fixture.nativeElement.textContent).not.toContain('private backend details');
    fixture.debugElement.query(By.css('ui-button button')).nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(getSurveys).toHaveBeenCalledTimes(2);
    expect(fixture.debugElement.queryAll(By.css('tbody tr'))).toHaveLength(1);
  });

  it('reloads for a changed global academic year and clears old rows', async () => {
    getSurveys.mockResolvedValueOnce([survey('one', 'ACTIVE')]).mockResolvedValueOnce([survey('two', 'CLOSED')]);
    await render();
    selectedAcademicYearId.set('year-b');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(getSurveys).toHaveBeenLastCalledWith('year-b');
    expect(fixture.nativeElement.textContent).toContain('استبيان two');
    expect(fixture.nativeElement.textContent).not.toContain('استبيان one');
  });

  it('filters locally by the returned name without pagination', async () => {
    getSurveys.mockResolvedValue([survey('one', 'ACTIVE'), survey('two', 'DRAFT')]);
    await render();
    const input = fixture.debugElement.query(By.css('#surveys-search input')).nativeElement as HTMLInputElement;
    input.value = 'two';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('tbody tr'))).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('استبيان two');
  });

  it('shows loading while the request is pending instead of an empty table', async () => {
    let resolveRequest!: (items: SurveyListItem[]) => void;
    getSurveys.mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
    fixture = TestBed.createComponent(SurveysComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل الاستبيانات');
    expect(fixture.debugElement.query(By.css('table'))).toBeNull();
    resolveRequest([]);
    await fixture.whenStable();
  });

  it('ignores an older academic year response after the year changes', async () => {
    let resolveOld!: (items: SurveyListItem[]) => void;
    getSurveys.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    getSurveys.mockResolvedValueOnce([survey('new', 'ACTIVE')]);
    fixture = TestBed.createComponent(SurveysComponent);
    fixture.detectChanges();
    selectedAcademicYearId.set('year-b');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    resolveOld([survey('old', 'DRAFT')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('استبيان new');
    expect(fixture.nativeElement.textContent).not.toContain('استبيان old');
  });

  it('shows create and row edit only with update permission', async () => {
    getSurveys.mockResolvedValue([survey('one', 'DRAFT')]);
    await render();
    expect(fixture.nativeElement.textContent).not.toContain('استبيان جديد');
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تعديل استبيان one"]'))).toBeNull();
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="بنية استبيان one"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="جولات استبيان one"]'))).not.toBeNull();
    canUpdate.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('استبيان جديد');
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تعديل استبيان one"]'))).not.toBeNull();
  });

  it('offers survey-level trends read access for archived surveys and opens the direct route', async () => {
    getSurveys.mockResolvedValue([{ ...survey('one', 'CLOSED'), archivedAt: '2026-03-01T00:00:00.000Z' }]);
    await render();
    const action = fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تحليل الاتجاهات: استبيان one"]'));
    expect(action).not.toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    action.nativeElement.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0][0].toString()).toBe('/surveys/one/analytics/trends');
    canRead.set(false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تحليل الاتجاهات: استبيان one"]'))).toBeNull();
  });

  it('offers a separate comparisons read action for archived surveys', async () => {
    getSurveys.mockResolvedValue([{ ...survey('one', 'CLOSED'), archivedAt: '2026-03-01T00:00:00.000Z' }]);
    await render();
    const action = fixture.debugElement.query(By.css('ui-table-actions button[aria-label="المقارنات: استبيان one"]'));
    expect(action).not.toBeNull();
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تحليل الاتجاهات: استبيان one"]'))).not.toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    action.nativeElement.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0][0].toString()).toBe('/surveys/one/analytics/comparisons');
    canRead.set(false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="المقارنات: استبيان one"]'))).toBeNull();
  });

  it('offers the survey report beside trends and comparisons for archived surveys with read access', async () => {
    getSurveys.mockResolvedValue([{ ...survey('one', 'CLOSED'), archivedAt: '2026-03-01T00:00:00.000Z' }]);
    await render();
    const report = fixture.debugElement.query(By.css('ui-table-actions button[aria-label="التقرير: استبيان one"]'));
    expect(report).not.toBeNull();
    expect(report.nativeElement.title).toBe('التقرير: استبيان one');
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تحليل الاتجاهات: استبيان one"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="المقارنات: استبيان one"]'))).not.toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    report.nativeElement.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0][0].toString()).toBe('/surveys/one/analytics/report');
    canRead.set(false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ui-table-actions button[aria-label="التقرير: استبيان one"]'))).toBeNull();
  });

  it('opens create form, sends the selected year and reloads after success', async () => {
    canUpdate.set(true);
    await render();
    fixture.debugElement.query(By.css('ui-page-header button')).nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[role="dialog"]'))).not.toBeNull();
    fixture.componentInstance.form.patchValue({ nameAr: '  اختبار  ' });
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(createSurvey).toHaveBeenCalledWith(expect.objectContaining({ academicYearId: 'year-a', nameAr: 'اختبار', status: 'DRAFT' }));
    expect(fixture.debugElement.query(By.css('[role="dialog"]'))).toBeNull();
    expect(getSurveys).toHaveBeenCalledTimes(2);
  });

  it('keeps all backend-supported status values in the create select', async () => {
    canUpdate.set(true);
    await render();
    fixture.componentInstance.openCreate();
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.css('#survey-status select')).nativeElement as HTMLSelectElement;
    expect(Array.from(select.options, option => [option.value, option.textContent?.trim()])).toEqual([
      ['DRAFT', 'مسودة'], ['ACTIVE', 'نشط'], ['CLOSED', 'مغلق'],
    ]);
    expect(select.value).toBe('DRAFT');
  });

  it.each([
    ['DRAFT', ['DRAFT', 'ACTIVE']],
    ['ACTIVE', ['ACTIVE', 'CLOSED']],
    ['CLOSED', ['CLOSED']],
  ] as const)('shows only backend-allowed edit options and selects current %s', async (current, expected) => {
    canUpdate.set(true);
    getSurveys.mockResolvedValue([survey('one', current)]);
    await render();
    fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تعديل استبيان one"]')).nativeElement.click();
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.css('#survey-status select')).nativeElement as HTMLSelectElement;
    expect(Array.from(select.options, option => option.value)).toEqual(expected);
    expect(select.value).toBe(current);
  });

  it('keeps the create form and entered value after a failed request', async () => {
    canUpdate.set(true);
    createSurvey.mockRejectedValue(new Error('SQL details'));
    await render();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ nameAr: 'اسم محفوظ' });
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(fixture.componentInstance.modalOpen()).toBe(true);
    expect(fixture.componentInstance.form.controls.nameAr.value).toBe('اسم محفوظ');
    expect(fixture.nativeElement.textContent).toContain('تعذر حفظ الاستبيان');
    expect(fixture.nativeElement.textContent).not.toContain('SQL details');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('prefills edit fields and sends a year-free update followed by reload', async () => {
    canUpdate.set(true);
    const item = { ...survey('one', 'ACTIVE'), nameHe: 'עברית', descriptionAr: 'وصف', audienceType: 'STAFF', isActive: false };
    getSurveys.mockResolvedValue([item]);
    await render();
    fixture.debugElement.query(By.css('ui-table-actions button[aria-label="تعديل استبيان one"]')).nativeElement.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.getRawValue()).toEqual(expect.objectContaining({ nameAr: item.nameAr, nameHe: 'עברית', descriptionAr: 'وصف', audienceType: 'STAFF', status: 'ACTIVE', isActive: false }));
    const statusSelect = fixture.debugElement.query(By.css('#survey-status select')).nativeElement as HTMLSelectElement;
    statusSelect.value = 'CLOSED';
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(updateSurvey).toHaveBeenCalledWith('one', expect.objectContaining({ nameAr: item.nameAr, isActive: false, status: 'CLOSED' }));
    expect(updateSurvey.mock.calls[0][1]).not.toHaveProperty('academicYearId');
    expect(getSurveys).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.modalOpen()).toBe(false);
  });

  it('prevents a second submission while the first is pending', async () => {
    canUpdate.set(true);
    let resolveSave!: (value: object) => void;
    createSurvey.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
    await render();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ nameAr: 'اختبار' });
    const first = fixture.componentInstance.save();
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(createSurvey).toHaveBeenCalledTimes(1);
    expect(fixture.debugElement.query(By.css('ui-button[form="survey-form"] button')).nativeElement.disabled).toBe(true);
    resolveSave({});
    await first;
  });
});
