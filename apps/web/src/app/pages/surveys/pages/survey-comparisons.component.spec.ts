import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { SurveyComparisonsReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import type { SurveyComparisonsResponse } from '../models/survey.model';
import { SurveyComparisonsComponent } from './survey-comparisons.component';

const named = (id: string) => ({ id, code: id.toUpperCase(), nameAr: id, nameHe: null });
const section = named('section');
const domain = { ...named('domain'), section };
const school = named('school');
const grade = named('grade');
const rounds = [
  { id: 'r1', code: 'R1', nameAr: 'الأولى', nameHe: null, sequenceNumber: 1, measurementDate: null, status: 'CLOSED' },
  { id: 'r2', code: 'R2', nameAr: 'الثانية', nameHe: null, sequenceNumber: 2, measurementDate: null, status: 'CLOSED' },
];
const comparison = (id: string, comparisonType: string, comparisonValue: number | null) => ({
  id, comparisonType, comparisonValue, comparisonCode: 'CODE', comparisonRoundCode: 'R0', noteAr: 'ملاحظة', noteHe: 'הערה',
});
const full: SurveyComparisonsResponse = {
  survey: { id: 'survey-1', nameAr: 'استبيان تجريبي', nameHe: null, academicYearId: 'year-1', archivedAt: '2026-03-01T00:00:00.000Z' },
  rounds,
  groups: [
    { roundId: 'r1', domainId: 'domain', segmentId: 'school', section, domain, segment: school, domainResult: { id: 'result-1', scorePercentage: 0, respondentCount: 0, isComparable: false }, comparisons: [comparison('c1', 'PREVIOUS_ROUND', 0), { ...comparison('c2', 'CUSTOM_TYPE', null), comparisonCode: null, comparisonRoundCode: null, noteAr: null, noteHe: null }] },
    { roundId: 'r1', domainId: 'domain', segmentId: 'grade', section, domain, segment: grade, domainResult: null, comparisons: [comparison('c3', 'SIMILAR_SCHOOLS', 73)] },
    { roundId: 'r2', domainId: 'domain', segmentId: 'school', section, domain, segment: school, domainResult: { id: 'result-2', scorePercentage: 51, respondentCount: 5, isComparable: true }, comparisons: [] },
  ],
};

describe('SurveyComparisonsComponent', () => {
  let fixture: ComponentFixture<SurveyComparisonsComponent>;
  const getSurveyComparisons = vi.fn<(surveyId: string) => Promise<SurveyComparisonsResponse>>();
  const paramMap = convertToParamMap({ surveyId: 'survey-1' });
  const render = async () => {
    fixture = TestBed.createComponent(SurveyComparisonsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const select = (id: string, value: string) => {
    const element = fixture.debugElement.query(By.css(`#${id} select`)).nativeElement as HTMLSelectElement;
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    getSurveyComparisons.mockReset().mockResolvedValue(full);
    await TestBed.configureTestingModule({
      imports: [SurveyComparisonsComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } }, { provide: SurveysApiService, useValue: { getSurveyComparisons } }],
    }).compileComponents();
  });

  it('loads directly with read permission and shows archived, stored comparison data without derivation', async () => {
    expect(routes.find(route => route.path === 'surveys/:surveyId/analytics/comparisons')?.data?.['requiredPermission']).toBe('surveys:read');
    await render();
    expect(getSurveyComparisons).toHaveBeenCalledExactlyOnceWith('survey-1');
    expect(fixture.nativeElement.textContent).toContain('استبيان تجريبي');
    expect(fixture.componentInstance.selectedRoundId()).toBe('r1');
    expect(fixture.componentInstance.selectedSegmentId()).toBe('school');
    expect(fixture.debugElement.queryAll(By.css('#comparison-round option')).map(item => item.nativeElement.textContent.trim())).toEqual(['الأولى', 'الثانية']);
    expect(fixture.nativeElement.textContent).toContain('0%');
    expect(fixture.nativeElement.textContent).toContain('الجولة السابقة');
    expect(fixture.nativeElement.textContent).toContain('CUSTOM_TYPE');
    expect(fixture.nativeElement.textContent).toContain('R0');
    expect(fixture.nativeElement.textContent).toContain('הערה');
    expect(fixture.debugElement.queryAll(By.css('.comparisons-table-scroll tbody tr'))).toHaveLength(2);
    expect(fixture.debugElement.query(By.css('ui-pagination, canvas, input, button[aria-label*="حذف"]'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toMatch(/تحسن|تراجع|أفضل|أسوأ/);
  });

  it('filters by segment id and resets the segment when the round changes', async () => {
    await render();
    select('comparison-segment', 'grade');
    expect(fixture.nativeElement.textContent).toContain('مدارس مشابهة');
    expect(fixture.nativeElement.textContent).toContain('لا توجد نتيجة مجال مسجلة');
    expect(fixture.nativeElement.textContent).not.toContain('الجولة السابقة');
    select('comparison-round', 'r2');
    expect(fixture.componentInstance.selectedSegmentId()).toBe('school');
    expect(fixture.componentInstance.segments().map(item => item.id)).toEqual(['school']);
    expect(fixture.nativeElement.textContent).toContain('51%');
    expect(fixture.nativeElement.textContent).toContain('لا توجد مقارنات مبلّغ عنها لهذا المجال.');
  });

  it('distinguishes empty survey data from an empty selected round', async () => {
    getSurveyComparisons.mockResolvedValueOnce({ ...full, groups: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد مقارنات مبلّغ عنها لهذا الاستبيان.');
    expect(fixture.debugElement.query(By.css('#comparison-segment'))).toBeNull();
    getSurveyComparisons.mockResolvedValueOnce({ ...full, rounds: [...rounds, { ...rounds[1], id: 'r3', nameAr: 'الثالثة' }] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    select('comparison-round', 'r3');
    expect(fixture.nativeElement.textContent).toContain('لا توجد بيانات مقارنة لهذه الجولة.');
    expect(fixture.debugElement.query(By.css('#comparison-segment'))).toBeNull();
  });

  it('keeps loading and errors distinct from empty data and retries', async () => {
    let resolveFirst!: (value: SurveyComparisonsResponse) => void;
    getSurveyComparisons.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    fixture = TestBed.createComponent(SurveyComparisonsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل مقارنات الاستبيان');
    resolveFirst(full);
    await fixture.whenStable();
    getSurveyComparisons.mockRejectedValueOnce(new SurveyComparisonsReadError('SURVEY_NOT_FOUND', 404));
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('الاستبيان غير موجود أو غير متاح.');
    getSurveyComparisons.mockRejectedValueOnce(new Error('network details'));
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('تعذر تحميل مقارنات الاستبيان. حاول مرة أخرى.');
    expect(fixture.nativeElement.textContent).not.toContain('network details');
    getSurveyComparisons.mockResolvedValueOnce(full);
    fixture.debugElement.query(By.css('[role="alert"] ui-button button')).nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('استبيان تجريبي');
    expect(getSurveyComparisons).toHaveBeenCalledTimes(4);
  });
});
