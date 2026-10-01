import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { SurveyTrendsReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { SurveyTrendLineChartComponent } from '../components/survey-trend-line-chart.component';
import type { SurveyTrendsResponse } from '../models/survey.model';
import { SurveyTrendsComponent } from './survey-trends.component';

const named = (id: string) => ({ id, code: id.toUpperCase(), nameAr: id, nameHe: null });
const section = named('section');
const domain = { ...named('domain'), section };
const otherDomain = { ...named('other-domain'), section };
const school = named('school');
const grade = named('grade');
const rounds = [
  { id: 'r1', code: 'R1', nameAr: 'الأولى', nameHe: null, sequenceNumber: 1, measurementDate: null, status: 'CLOSED' },
  { id: 'r2', code: 'R2', nameAr: 'الثانية', nameHe: null, sequenceNumber: 2, measurementDate: null, status: 'CLOSED' },
  { id: 'r3', code: 'R3', nameAr: 'الثالثة', nameHe: null, sequenceNumber: 3, measurementDate: null, status: 'CLOSED' },
];
const point = (roundId: string, value: number | null, deltaFromPrevious: number | null) => ({ roundId, value, respondentCount: value === null ? null : 0, deltaFromPrevious });
const full: SurveyTrendsResponse = {
  survey: { id: 'survey-1', nameAr: 'استبيان تجريبي', nameHe: null, academicYearId: 'year-1', archivedAt: '2026-03-01T00:00:00.000Z' },
  rounds,
  indicatorTrends: [
    { indicator: { id: 'i1', code: 'I1', textAr: 'مؤشر أول', textHe: null, isReverseDirection: true }, domain, section, segment: school, firstValue: 60, latestValue: 0, changeFromFirst: -60, points: [point('r1', 60, null), point('r2', null, null), point('r3', 0, -60)] },
    { indicator: { id: 'i2', code: 'I2', textAr: 'مؤشر ثانٍ', textHe: null, isReverseDirection: false }, domain, section, segment: school, firstValue: 40, latestValue: 55, changeFromFirst: 15, points: [point('r1', 40, null), point('r2', 50, 10), point('r3', 55, 5)] },
    { indicator: { id: 'i3', code: 'I3', textAr: 'مؤشر الشريحة الأخرى', textHe: null, isReverseDirection: false }, domain, section, segment: grade, firstValue: 80, latestValue: 82, changeFromFirst: 2, points: [point('r1', 80, null), point('r2', 81, 1), point('r3', 82, 1)] },
  ],
  domainTrends: [
    { domain, section, segment: school, firstValue: 20, latestValue: 0, changeFromFirst: -20, points: [{ ...point('r1', 20, null), isComparable: true }, { ...point('r2', null, null), isComparable: null }, { ...point('r3', 0, -20), isComparable: false }] },
    { domain: otherDomain, section, segment: school, firstValue: 50, latestValue: 70, changeFromFirst: 20, points: [{ ...point('r1', 50, null), isComparable: true }, { ...point('r2', 60, 10), isComparable: true }, { ...point('r3', 70, 10), isComparable: true }] },
    { domain, section, segment: grade, firstValue: 12, latestValue: 14, changeFromFirst: 2, points: [{ ...point('r1', 12, null), isComparable: true }, { ...point('r2', 13, 1), isComparable: true }, { ...point('r3', 14, 1), isComparable: true }] },
  ],
  participationTrends: [
    { segment: school, firstValue: 0, latestValue: 50, changeFromFirst: 50, points: [{ roundId: 'r1', participantCount: 0, eligibleCount: 10, responseRate: 0, deltaFromPrevious: null }, { roundId: 'r2', participantCount: 5, eligibleCount: 10, responseRate: 50, deltaFromPrevious: 50 }, { roundId: 'r3', participantCount: null, eligibleCount: null, responseRate: null, deltaFromPrevious: null }] },
    { segment: grade, firstValue: 20, latestValue: 40, changeFromFirst: 20, points: [{ roundId: 'r1', participantCount: 2, eligibleCount: 10, responseRate: 20, deltaFromPrevious: null }, { roundId: 'r2', participantCount: 3, eligibleCount: 10, responseRate: 30, deltaFromPrevious: 10 }, { roundId: 'r3', participantCount: 4, eligibleCount: 10, responseRate: 40, deltaFromPrevious: 10 }] },
  ],
};

describe('SurveyTrendsComponent', () => {
  let fixture: ComponentFixture<SurveyTrendsComponent>;
  const getSurveyTrends = vi.fn<(surveyId: string) => Promise<SurveyTrendsResponse>>();
  const paramMap = convertToParamMap({ surveyId: 'survey-1' });
  const render = async () => {
    fixture = TestBed.createComponent(SurveyTrendsComponent);
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
  const chartValues = () => fixture.debugElement.queryAll(By.directive(SurveyTrendLineChartComponent)).map(item => item.componentInstance.data().datasets[0].data);

  beforeEach(async () => {
    getSurveyTrends.mockReset().mockResolvedValue(full);
    await TestBed.configureTestingModule({
      imports: [SurveyTrendsComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } }, { provide: SurveysApiService, useValue: { getSurveyTrends } }],
    }).overrideComponent(SurveyTrendLineChartComponent, { set: { template: '', imports: [] } }).compileComponents();
  });

  it('loads directly with read permission, preserves round order, and shows archived stored data', async () => {
    expect(routes.find(route => route.path === 'surveys/:surveyId/analytics/trends')?.data?.['requiredPermission']).toBe('surveys:read');
    await render();
    expect(getSurveyTrends).toHaveBeenCalledExactlyOnceWith('survey-1');
    expect(fixture.nativeElement.textContent).toContain('استبيان تجريبي');
    expect(fixture.debugElement.queryAll(By.css('.trends-rounds strong')).map(item => item.nativeElement.textContent.trim())).toEqual(['الأولى', 'الثانية', 'الثالثة']);
    expect(fixture.componentInstance.segments().map(item => item.id)).toEqual(['school', 'grade']);
    expect(fixture.componentInstance.selectedSegmentId()).toBe('school');
    expect(fixture.componentInstance.selectedIndicator()?.indicator.id).toBe('i1');
    expect(fixture.componentInstance.selectedDomain()?.domain.id).toBe('domain');
    expect(chartValues()).toEqual([[60, null, 0], [20, null, 0], [0, 50, null]]);
    const charts = fixture.debugElement.queryAll(By.directive(SurveyTrendLineChartComponent));
    expect(charts).toHaveLength(3);
    expect(charts[0].componentInstance.data().labels).toEqual(['الأولى', 'الثانية', 'الثالثة']);
    expect(charts[0].componentInstance.data().datasets[0].spanGaps).toBe(false);
    expect(charts[0].componentInstance.options().scales?.['y']?.max).toBe(100);
    expect(fixture.nativeElement.textContent).toContain('0%');
    expect(fixture.nativeElement.textContent).toContain('-60');
    expect(fixture.nativeElement.textContent).toContain('غير قابل للمقارنة');
    expect(fixture.debugElement.queryAll(By.css('.trends-table-scroll table'))).toHaveLength(3);
    expect(fixture.debugElement.query(By.css('ui-pagination, input, button[aria-label*="حذف"]'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toMatch(/تحسن|تراجع|أفضل|أسوأ/);
    expect(fixture.nativeElement.textContent).not.toContain('SIMILAR_SCHOOLS');
  });

  it('changes indicator, domain, and segment without mixing stored values', async () => {
    await render();
    select('trend-indicator', 'i2');
    expect(chartValues()[0]).toEqual([40, 50, 55]);
    select('trend-domain', 'other-domain');
    expect(chartValues()[1]).toEqual([50, 60, 70]);
    select('trend-segment', 'grade');
    expect(fixture.componentInstance.selectedIndicator()?.indicator.id).toBe('i3');
    expect(fixture.componentInstance.selectedDomain()?.domain.id).toBe('domain');
    expect(chartValues()).toEqual([[80, 81, 82], [12, 13, 14], [20, 30, 40]]);
    expect(fixture.nativeElement.textContent).not.toContain('مؤشر أول');
  });

  it('presents backend-provided deltas and summaries without deriving them from chart values', async () => {
    getSurveyTrends.mockResolvedValueOnce({
      ...full,
      indicatorTrends: [{ ...full.indicatorTrends[0], changeFromFirst: 9, points: [full.indicatorTrends[0].points[0], full.indicatorTrends[0].points[1], { ...full.indicatorTrends[0].points[2], deltaFromPrevious: 7 }] }],
      domainTrends: [{ ...full.domainTrends[0], changeFromFirst: 8, points: [full.domainTrends[0].points[0], full.domainTrends[0].points[1], { ...full.domainTrends[0].points[2], deltaFromPrevious: 6 }] }],
      participationTrends: [{ ...full.participationTrends[0], changeFromFirst: 5, points: [full.participationTrends[0].points[0], { ...full.participationTrends[0].points[1], deltaFromPrevious: 4 }, full.participationTrends[0].points[2]] }],
    });
    await render();
    const summaries = fixture.debugElement.queryAll(By.css('.trends-summary'));
    expect(summaries.map(item => item.nativeElement.textContent)).toEqual([expect.stringContaining('+9 نقطة مئوية'), expect.stringContaining('+8 نقطة مئوية'), expect.stringContaining('+5 نقطة مئوية')]);
    const tables = fixture.debugElement.queryAll(By.css('.trends-table-scroll table'));
    expect(tables[0].nativeElement.textContent).toContain('+7');
    expect(tables[1].nativeElement.textContent).toContain('+6');
    expect(tables[2].nativeElement.textContent).toContain('+4');
    expect(chartValues()).toEqual([[60, null, 0], [20, null, 0], [0, 50, null]]);
  });

  it('handles one round, no results, and partial segment data independently', async () => {
    getSurveyTrends.mockResolvedValueOnce({ ...full, rounds: [rounds[0]], indicatorTrends: [], domainTrends: [], participationTrends: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد نتائج كافية لعرض الاتجاهات.');
    expect(fixture.debugElement.query(By.directive(SurveyTrendLineChartComponent))).toBeNull();
    getSurveyTrends.mockResolvedValueOnce({ ...full, rounds: [rounds[0]], indicatorTrends: [{ ...full.indicatorTrends[0], points: [full.indicatorTrends[0].points[0]], firstValue: 60, latestValue: 60, changeFromFirst: null }], domainTrends: [], participationTrends: [] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('يلزم أكثر من جولة');
    expect(fixture.nativeElement.textContent).toContain('لا توجد نتائج مجالات لهذه الشريحة.');
    expect(fixture.nativeElement.textContent).toContain('لا توجد بيانات مشاركة لهذه الشريحة.');
    expect(chartValues()).toEqual([[60]]);
  });

  it('keeps loading and errors separate from empty results and retries the GET', async () => {
    let resolveFirst!: (value: SurveyTrendsResponse) => void;
    getSurveyTrends.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    fixture = TestBed.createComponent(SurveyTrendsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل اتجاهات الاستبيان');
    resolveFirst(full);
    await fixture.whenStable();
    getSurveyTrends.mockRejectedValueOnce(new SurveyTrendsReadError('SURVEY_NOT_FOUND', 404));
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('الاستبيان غير موجود أو غير متاح.');
    getSurveyTrends.mockRejectedValueOnce(new Error('network details'));
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('تعذر تحميل اتجاهات الاستبيان. حاول مرة أخرى.');
    expect(fixture.nativeElement.textContent).not.toContain('network details');
    getSurveyTrends.mockResolvedValueOnce(full);
    fixture.debugElement.query(By.css('[role="alert"] ui-button button')).nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('استبيان تجريبي');
    expect(getSurveyTrends).toHaveBeenCalledTimes(4);
  });
});
