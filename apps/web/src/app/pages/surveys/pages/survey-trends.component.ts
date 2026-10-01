import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SurveyTrendsReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { SurveyTrendLineChartComponent } from '../components/survey-trend-line-chart.component';
import type { SurveyDomainTrend, SurveyIndicatorTrend, SurveyParticipationTrend, SurveyResultNamedItem, SurveyTrendsResponse } from '../models/survey.model';

@Component({
  selector: 'app-survey-trends',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink, UiButtonComponent, UiEmptyStateComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent, SurveyTrendLineChartComponent],
  templateUrl: './survey-trends.component.html',
  styleUrl: './survey-trends.component.css',
})
export class SurveyTrendsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(SurveysApiService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly surveyId = computed(() => this.params().get('surveyId'));
  readonly result = signal<SurveyTrendsResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedSegmentId = signal<string | null>(null);
  readonly selectedIndicatorId = signal<string | null>(null);
  readonly selectedDomainId = signal<string | null>(null);
  readonly segments = computed(() => this.collectSegments(this.result()));
  readonly noResults = computed(() => {
    const value = this.result();
    return Boolean(value && !value.indicatorTrends.length && !value.domainTrends.length && !value.participationTrends.length);
  });
  readonly indicators = computed(() => this.result()?.indicatorTrends.filter(item => item.segment.id === this.selectedSegmentId()) ?? []);
  readonly domains = computed(() => this.result()?.domainTrends.filter(item => item.segment.id === this.selectedSegmentId()) ?? []);
  readonly selectedIndicator = computed<SurveyIndicatorTrend | null>(() => this.indicators().find(item => item.indicator.id === this.selectedIndicatorId()) ?? this.indicators()[0] ?? null);
  readonly selectedDomain = computed<SurveyDomainTrend | null>(() => this.domains().find(item => item.domain.id === this.selectedDomainId()) ?? this.domains()[0] ?? null);
  readonly selectedParticipation = computed<SurveyParticipationTrend | null>(() => this.result()?.participationTrends.find(item => item.segment.id === this.selectedSegmentId()) ?? null);
  readonly indicatorValues = computed(() => this.selectedIndicator()?.points.map(point => point.value) ?? []);
  readonly domainValues = computed(() => this.selectedDomain()?.points.map(point => point.value) ?? []);
  readonly participationValues = computed(() => this.selectedParticipation()?.points.map(point => point.responseRate) ?? []);
  private requestVersion = 0;

  constructor() { effect(() => { void this.load(this.surveyId()); }); }

  async retry(): Promise<void> { await this.load(this.surveyId()); }

  selectSegment(id: string): void {
    if (!this.segments().some(item => item.id === id)) return;
    this.selectedSegmentId.set(id);
    this.selectedIndicatorId.set(this.indicators()[0]?.indicator.id ?? null);
    this.selectedDomainId.set(this.domains()[0]?.domain.id ?? null);
  }

  selectIndicator(id: string): void { if (this.indicators().some(item => item.indicator.id === id)) this.selectedIndicatorId.set(id); }
  selectDomain(id: string): void { if (this.domains().some(item => item.domain.id === id)) this.selectedDomainId.set(id); }
  roundName(id: string): string { return this.result()?.rounds.find(round => round.id === id)?.nameAr ?? '—'; }
  percentage(value: number | null): string { return value === null ? '—' : `${value}%`; }
  count(value: number | null): string { return value === null ? '—' : String(value); }
  change(value: number | null): string { return value === null ? '—' : value > 0 ? `+${value}` : String(value); }
  changeWithUnit(value: number | null): string { return value === null ? '—' : `${this.change(value)} نقطة مئوية`; }
  comparable(value: boolean | null): string { return value === null ? '—' : value ? 'قابل للمقارنة' : 'غير قابل للمقارنة'; }

  private collectSegments(value: SurveyTrendsResponse | null): SurveyResultNamedItem[] {
    if (!value) return [];
    const seen = new Set<string>();
    const segments: SurveyResultNamedItem[] = [];
    for (const trend of [...value.indicatorTrends, ...value.domainTrends, ...value.participationTrends]) {
      if (seen.has(trend.segment.id)) continue;
      seen.add(trend.segment.id);
      segments.push(trend.segment);
    }
    return segments;
  }

  private async load(surveyId: string | null): Promise<void> {
    const version = ++this.requestVersion;
    this.result.set(null);
    this.selectedSegmentId.set(null);
    this.selectedIndicatorId.set(null);
    this.selectedDomainId.set(null);
    this.error.set('');
    this.loading.set(Boolean(surveyId));
    if (!surveyId) { this.error.set('الاستبيان غير متاح.'); return; }
    try {
      const value = await this.api.getSurveyTrends(surveyId);
      if (version !== this.requestVersion) return;
      this.result.set(value);
      const firstSegment = this.segments()[0];
      if (firstSegment) this.selectSegment(firstSegment.id);
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.error.set(error instanceof SurveyTrendsReadError && error.code === 'SURVEY_NOT_FOUND'
        ? 'الاستبيان غير موجود أو غير متاح.'
        : error instanceof SurveyTrendsReadError && error.status === 403
          ? 'ليس لديك صلاحية لعرض اتجاهات الاستبيان.'
          : 'تعذر تحميل اتجاهات الاستبيان. حاول مرة أخرى.');
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }
}
