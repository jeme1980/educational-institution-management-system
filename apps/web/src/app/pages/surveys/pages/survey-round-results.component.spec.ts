import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { SurveyResultsReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import type { SurveyRoundResultsResponse } from '../models/survey.model';
import { SurveyRoundResultsComponent } from './survey-round-results.component';

const named = (id: string) => ({ id, code: id.toUpperCase(), nameAr: id, nameHe: null });
const section = named('section');
const domain = { ...named('domain'), section };
const segment = named('segment');
const full: SurveyRoundResultsResponse = {
  survey: { id: 'survey-1', nameAr: 'استبيان التجربة', nameHe: null, academicYearId: 'year-1', archivedAt: '2026-03-01T00:00:00.000Z' },
  round: { id: 'round-1', code: 'ROUND_1', nameAr: 'الجولة الأولى', nameHe: null, sequenceNumber: 1, status: 'CLOSED', measurementDate: null },
  import: { id: 'batch-1', originalFileName: 'results.xlsx', status: 'COMPLETED', rowCount: 4, importedAt: '2026-03-02T00:00:00.000Z' },
  indicatorResults: [
    { id: 'indicator-result-2', section, domain, indicator: { id: 'i2', code: 'I2', textAr: 'مؤشر ثانٍ', textHe: null }, segment, reportedPercentage: null, respondentCount: null, earnedTotal: null, possibleTotal: null },
    { id: 'indicator-result-1', section, domain, indicator: { id: 'i1', code: 'I1', textAr: 'مؤشر أول', textHe: null }, segment, reportedPercentage: 0, respondentCount: 0, earnedTotal: 0, possibleTotal: null },
  ],
  domainResults: [
    { id: 'domain-result-1', domain, segment, scorePercentage: 0, respondentCount: 0, isComparable: false },
    { id: 'domain-result-2', domain, segment, scorePercentage: null, respondentCount: null, isComparable: true },
  ],
  comparisons: [
    { id: 'comparison-1', domain, segment, comparisonType: 'PREVIOUS_ROUND', comparisonCode: null, comparisonValue: 0, comparisonRoundCode: 'ROUND_0', noteAr: null, noteHe: null },
    { id: 'comparison-2', domain, segment, comparisonType: 'FUTURE_TYPE', comparisonCode: null, comparisonValue: null, comparisonRoundCode: null, noteAr: null, noteHe: null },
  ],
  participation: [
    { id: 'participation-1', segment, participantCount: 0, eligibleCount: null, responseRate: 0 },
    { id: 'participation-2', segment, participantCount: null, eligibleCount: null, responseRate: null },
  ],
};

describe('SurveyRoundResultsComponent', () => {
  let fixture: ComponentFixture<SurveyRoundResultsComponent>;
  const getSurveyRoundResults = vi.fn<(surveyId: string, roundId: string) => Promise<SurveyRoundResultsResponse>>();
  const paramMap = convertToParamMap({ surveyId: 'survey-1', roundId: 'round-1' });
  const render = async () => {
    fixture = TestBed.createComponent(SurveyRoundResultsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    getSurveyRoundResults.mockReset().mockResolvedValue(full);
    await TestBed.configureTestingModule({
      imports: [SurveyRoundResultsComponent],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } },
        { provide: SurveysApiService, useValue: { getSurveyRoundResults } },
      ],
    }).compileComponents();
  });

  it('loads direct-route context from the single read API and renders archived aggregate results in backend order', async () => {
    expect(routes.find(route => route.path === 'surveys/:surveyId/rounds/:roundId/results')?.data?.['requiredPermission']).toBe('surveys:read');
    await render();
    expect(getSurveyRoundResults).toHaveBeenCalledExactlyOnceWith('survey-1', 'round-1');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('استبيان التجربة · الجولة الأولى');
    expect(text).toContain('results.xlsx');
    expect(text).toContain('مكتمل');
    expect(text).toContain('عدد الصفوف');
    expect(text).toContain('نتائج المؤشرات');
    expect(text).toContain('نتائج المجالات');
    expect(text).toContain('المقارنات');
    expect(text).toContain('المشاركة');
    expect(text).toContain('غير قابل للمقارنة');
    expect(text).toContain('قابل للمقارنة');
    expect(text).toContain('الجولة السابقة');
    expect(text).toContain('FUTURE_TYPE');
    expect(text).toContain('0%');
    expect(text).toContain('—');
    expect(fixture.debugElement.queryAll(By.css('ui-section-card'))).toHaveLength(5);
    expect(fixture.debugElement.queryAll(By.css('ui-section-card table'))).toHaveLength(4);
    const indicatorRows = fixture.debugElement.queryAll(By.css('ui-section-card table'))[0].queryAll(By.css('tbody tr'));
    expect(indicatorRows[0].nativeElement.textContent).toContain('مؤشر ثانٍ');
    expect(indicatorRows[1].nativeElement.textContent).toContain('مؤشر أول');
    expect(fixture.debugElement.query(By.css('ui-pagination, canvas, input, button[aria-label*="حذف"]'))).toBeNull();
  });

  it('treats a 200 response with no results as a compact empty state', async () => {
    getSurveyRoundResults.mockResolvedValue({ ...full, import: null, indicatorResults: [], domainResults: [], comparisons: [], participation: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد نتائج مسجلة لهذه الجولة.');
    expect(fixture.debugElement.query(By.css('ui-section-card'))).toBeNull();
    expect(fixture.debugElement.query(By.css('[role="alert"]'))).toBeNull();
  });

  it('shows loading separately and supports friendly errors with retry', async () => {
    let resolveFirst!: (value: SurveyRoundResultsResponse) => void;
    getSurveyRoundResults.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    fixture = TestBed.createComponent(SurveyRoundResultsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل نتائج الجولة');
    expect(fixture.nativeElement.textContent).not.toContain('لا توجد نتائج مسجلة');
    resolveFirst(full);
    await fixture.whenStable();
    getSurveyRoundResults.mockRejectedValueOnce(new SurveyResultsReadError('SURVEY_ROUND_NOT_FOUND', 404));
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('الجولة غير موجودة أو لا تتبع هذا الاستبيان.');
    getSurveyRoundResults.mockResolvedValueOnce(full);
    fixture.debugElement.query(By.css('[role="alert"] ui-button button')).nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('مؤشر أول');
  });

  it('shows a network error without presenting an empty result and retries successfully', async () => {
    getSurveyRoundResults.mockRejectedValueOnce(new Error('network'));
    await render();
    expect(fixture.nativeElement.textContent).toContain('تعذر تحميل نتائج الجولة. حاول مرة أخرى.');
    expect(fixture.nativeElement.textContent).not.toContain('لا توجد نتائج مسجلة');
    getSurveyRoundResults.mockResolvedValueOnce(full);
    fixture.debugElement.query(By.css('[role="alert"] ui-button button')).nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('استبيان التجربة · الجولة الأولى');
  });
});
