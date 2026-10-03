import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { SurveyReportReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import type { SurveyAnalyticsReportResponse } from '../models/survey.model';
import { SurveyReportComponent } from './survey-report.component';

const named = (id: string) => ({ id, code: id.toUpperCase(), nameAr: id, nameHe: null });
const section = named('قسم');
const domain = { ...named('مجال'), section };
const segment = { ...named('شريحة'), segmentType: null, sortOrder: 1 };
const unused = { ...named('فارغة'), segmentType: null, sortOrder: 2 };
const rounds = [
  { id: 'r2', code: 'R2', nameAr: 'الثانية', nameHe: null, sequenceNumber: 2, measurementDate: null, status: 'CLOSED' },
  { id: 'r1', code: 'R1', nameAr: 'الأولى', nameHe: null, sequenceNumber: 1, measurementDate: '2026-01-01T00:00:00.000Z', status: 'CLOSED' },
];
const indicator = { id: 'i1', code: 'I1', textAr: 'مؤشر مخزن', textHe: null, isReverseDirection: true };
const full: SurveyAnalyticsReportResponse = {
  survey: { id: 'survey-1', academicYearId: 'year-1', nameAr: 'استبيان التقرير', nameHe: null, descriptionAr: 'وصف', descriptionHe: null, audienceType: 'STAFF', status: 'CLOSED', archivedAt: '2026-03-01T00:00:00.000Z' },
  rounds, segments: [segment, unused], selectedRound: rounds[1], selectedSegment: segment,
  snapshot: {
    indicatorResults: [{ id: 'ir1', section, domain, indicator, segment, reportedPercentage: 0, respondentCount: 0, earnedTotal: 0, possibleTotal: 10 }],
    domainResults: [{ id: 'dr1', domain, segment, scorePercentage: null, respondentCount: 0, isComparable: false }],
    participation: { id: 'pr1', segment, participantCount: 0, eligibleCount: 10, responseRate: 0 },
  },
  trends: {
    indicatorTrends: [{ indicator, domain, section, segment, firstValue: 0, latestValue: 40, changeFromFirst: 7, points: [{ roundId: 'r2', value: null, respondentCount: null, deltaFromPrevious: null }, { roundId: 'r1', value: 0, respondentCount: 0, deltaFromPrevious: 5 }] }],
    domainTrends: [{ domain, section, segment, firstValue: null, latestValue: 0, changeFromFirst: 0, points: [{ roundId: 'r2', value: null, respondentCount: null, deltaFromPrevious: null, isComparable: null }, { roundId: 'r1', value: 0, respondentCount: 0, deltaFromPrevious: 4, isComparable: false }] }],
    participationTrend: { segment, firstValue: 0, latestValue: 0, changeFromFirst: 0, points: [{ roundId: 'r2', participantCount: null, eligibleCount: null, responseRate: null, deltaFromPrevious: null }, { roundId: 'r1', participantCount: 0, eligibleCount: 10, responseRate: 0, deltaFromPrevious: 3 }] },
  },
  comparisons: [
    { roundId: 'r1', domainId: 'd1', segmentId: segment.id, section, domain, segment, domainResult: { id: 'dr1', scorePercentage: 0, respondentCount: 0, isComparable: false }, comparisons: [{ id: 'c1', comparisonType: 'PREVIOUS_ROUND', comparisonCode: 'REF', comparisonValue: 99, comparisonRoundCode: 'R2', noteAr: 'ملاحظة', noteHe: null }, { id: 'c2', comparisonType: 'OTHER', comparisonCode: null, comparisonValue: 0, comparisonRoundCode: null, noteAr: null, noteHe: null }] },
    { roundId: 'r1', domainId: 'd2', segmentId: segment.id, section, domain: { ...named('مجال ثانٍ'), section }, segment, domainResult: { id: 'dr2', scorePercentage: null, respondentCount: null, isComparable: true }, comparisons: [] },
    { roundId: 'r1', domainId: 'd3', segmentId: segment.id, section, domain: { ...named('مجال ثالث'), section }, segment, domainResult: null, comparisons: [{ id: 'c3', comparisonType: 'SIMILAR_SCHOOLS', comparisonCode: null, comparisonValue: null, comparisonRoundCode: null, noteAr: null, noteHe: null }] },
  ],
};

describe('SurveyReportComponent', () => {
  let fixture: ComponentFixture<SurveyReportComponent>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const params = convertToParamMap({ surveyId: 'survey-1' });
  const getSurveyReport = vi.fn<(surveyId: string, options?: { roundId?: string; segmentId?: string }) => Promise<SurveyAnalyticsReportResponse>>();
  const navigate = vi.fn();

  const render = async () => {
    fixture = TestBed.createComponent(SurveyReportComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const select = async (id: string, value: string) => {
    const element = fixture.debugElement.query(By.css(`#${id} select`)).nativeElement as HTMLSelectElement;
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    query = new BehaviorSubject(convertToParamMap({}));
    getSurveyReport.mockReset().mockResolvedValue(full);
    navigate.mockReset().mockImplementation((_commands, options: { queryParams: { roundId: string | null; segmentId: string | null }; queryParamsHandling?: string }) => {
      const previous = query.value;
      query.next(convertToParamMap({
        roundId: options.queryParams.roundId ?? (options.queryParamsHandling === 'merge' ? previous.get('roundId') : null),
        segmentId: options.queryParams.segmentId ?? null,
      }));
      return Promise.resolve(true);
    });
    await TestBed.configureTestingModule({
      imports: [SurveyReportComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params, queryParamMap: query.value }, paramMap: new BehaviorSubject(params), queryParamMap: query.asObservable() } },
        { provide: Router, useValue: { navigate } },
        { provide: SurveysApiService, useValue: { getSurveyReport } },
      ],
    }).compileComponents();
  });

  it('loads the direct read route, renders backend defaults, and canonicalizes URL without a second GET', async () => {
    expect(routes.find(route => route.path === 'surveys/:surveyId/analytics/report')?.data?.['requiredPermission']).toBe('surveys:read');
    await render();
    expect(getSurveyReport).toHaveBeenCalledExactlyOnceWith('survey-1', { roundId: undefined, segmentId: undefined });
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { roundId: 'r1', segmentId: segment.id }, replaceUrl: true }));
    expect(query.value.get('roundId')).toBe('r1');
    expect(fixture.nativeElement.textContent).toContain('استبيان التقرير');
    expect(fixture.nativeElement.textContent).toContain('مؤرشف');
    expect(fixture.nativeElement.textContent).toContain('0%');
    expect(fixture.nativeElement.textContent).toContain('غير قابل للمقارنة');
    expect(fixture.debugElement.queryAll(By.css('.report-table-scroll table'))).toHaveLength(7);
    expect(fixture.debugElement.query(By.css('canvas, ui-pagination'))).toBeNull();
  });

  it('sends explicit URL values, changes rounds without retaining the old segment, and changes segment', async () => {
    query.next(convertToParamMap({ roundId: 'r1', segmentId: segment.id }));
    await render();
    expect(getSurveyReport).toHaveBeenCalledWith('survey-1', { roundId: 'r1', segmentId: segment.id });
    getSurveyReport.mockResolvedValueOnce({ ...full, selectedRound: rounds[0], selectedSegment: unused });
    await select('report-round', 'r2');
    expect(getSurveyReport).toHaveBeenLastCalledWith('survey-1', { roundId: 'r2', segmentId: undefined });
    expect(query.value.get('segmentId')).toBe(unused.id);
    await select('report-segment', segment.id);
    expect(getSurveyReport).toHaveBeenLastCalledWith('survey-1', { roundId: 'r2', segmentId: segment.id });
  });

  it('preserves null defaults and partial snapshot data without invented zeros', async () => {
    getSurveyReport.mockResolvedValueOnce({ ...full, selectedRound: null, selectedSegment: null, snapshot: { indicatorResults: [], domainResults: [], participation: null }, trends: { indicatorTrends: [], domainTrends: [], participationTrend: null }, comparisons: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد نتائج متاحة لإعداد التقرير.');
    expect((fixture.debugElement.query(By.css('#report-round select')).nativeElement as HTMLSelectElement).value).toBe('');
    expect((fixture.debugElement.query(By.css('#report-segment select')).nativeElement as HTMLSelectElement).value).toBe('');
    getSurveyReport.mockResolvedValueOnce({ ...full, snapshot: { indicatorResults: full.snapshot.indicatorResults, domainResults: [], participation: null }, trends: { indicatorTrends: [], domainTrends: [], participationTrend: null }, comparisons: [] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('مؤشر مخزن');
    expect(fixture.nativeElement.textContent).toContain('لا توجد نتائج مجالات');
    expect(fixture.nativeElement.textContent).toContain('لا توجد بيانات مشاركة');
  });

  it('shows API trend values and partial comparison groups without calculating gaps or judgments', async () => {
    await render();
    const tables = fixture.debugElement.queryAll(By.css('.report-table-scroll table'));
    expect(tables[2].nativeElement.textContent).toContain('+7');
    expect(tables[2].nativeElement.textContent).toContain('—');
    expect(tables[2].nativeElement.textContent).toContain('0%');
    expect(tables[3].nativeElement.textContent).toContain('0');
    expect(tables[4].nativeElement.textContent).toContain('+3');
    expect(fixture.nativeElement.textContent).toContain('الجولة السابقة');
    expect(fixture.nativeElement.textContent).toContain('مدارس مشابهة');
    expect(fixture.nativeElement.textContent).toContain('OTHER');
    expect(fixture.nativeElement.textContent).toContain('لا توجد نتيجة مجال مسجلة');
    expect(fixture.nativeElement.textContent).toContain('لا توجد مقارنات مبلّغ عنها لهذا المجال');
    expect(fixture.nativeElement.textContent).not.toMatch(/تحسن|تراجع|أفضل|أسوأ|فوق المرجع|تحت المرجع/);
  });

  it('shows a safe error and retries the same explicit URL selection', async () => {
    query.next(convertToParamMap({ roundId: 'r1', segmentId: segment.id }));
    getSurveyReport.mockRejectedValueOnce(new SurveyReportReadError('SURVEY_ROUND_NOT_FOUND', 404)).mockResolvedValueOnce(full);
    await render();
    expect(fixture.nativeElement.textContent).toContain('الجولة المطلوبة غير موجودة');
    expect(fixture.nativeElement.textContent).not.toContain('Survey report read request failed');
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(getSurveyReport).toHaveBeenLastCalledWith('survey-1', { roundId: 'r1', segmentId: segment.id });
    expect(fixture.nativeElement.textContent).toContain('نتائج الجولة');
  });

  it('follows browser URL changes and keeps loading separate from an empty report', async () => {
    let resolveInitial!: (value: SurveyAnalyticsReportResponse) => void;
    getSurveyReport.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }));
    fixture = TestBed.createComponent(SurveyReportComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل تقرير الاستبيان');
    expect(fixture.nativeElement.textContent).not.toContain('لا توجد نتائج متاحة لإعداد التقرير');
    resolveInitial(full);
    await fixture.whenStable();
    fixture.detectChanges();

    getSurveyReport.mockResolvedValueOnce({ ...full, selectedRound: rounds[0] });
    query.next(convertToParamMap({ roundId: 'r2', segmentId: segment.id }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(getSurveyReport).toHaveBeenLastCalledWith('survey-1', { roundId: 'r2', segmentId: segment.id });
    expect(fixture.componentInstance.report()?.selectedRound?.id).toBe('r2');

    query.next(convertToParamMap({ roundId: 'r1', segmentId: segment.id }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(getSurveyReport).toHaveBeenLastCalledWith('survey-1', { roundId: 'r1', segmentId: segment.id });
    expect(fixture.componentInstance.report()?.selectedRound?.id).toBe('r1');
  });
});
