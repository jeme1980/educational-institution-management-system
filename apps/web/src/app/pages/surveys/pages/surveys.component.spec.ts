import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../core/services/api.service';
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
    await TestBed.configureTestingModule({
      imports: [SurveysComponent],
      providers: [
        { provide: ApiService, useValue: { selectedAcademicYearId, academicYears } },
        { provide: SurveysApiService, useValue: { getSurveys } },
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
});
