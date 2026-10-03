import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SurveyReportReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import type { SurveyAnalyticsReportResponse, SurveyTrendPoint, SurveyParticipationTrendPoint } from '../models/survey.model';

@Component({
  selector: 'app-survey-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink, UiButtonComponent, UiEmptyStateComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent],
  templateUrl: './survey-report.component.html',
  styleUrl: './survey-report.component.css',
})
export class SurveyReportComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(SurveysApiService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly surveyId = computed(() => this.params().get('surveyId'));
  readonly roundId = computed(() => this.query().get('roundId'));
  readonly segmentId = computed(() => this.query().get('segmentId'));
  readonly report = signal<SurveyAnalyticsReportResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private requestVersion = 0;
  private loadedKey = '';

  constructor() {
    effect(() => {
      const surveyId = this.surveyId();
      const roundId = this.roundId();
      const segmentId = this.segmentId();
      const key = this.key(surveyId, roundId, segmentId);
      if (key !== this.loadedKey) void this.load(surveyId, roundId, segmentId);
    });
  }

  async retry(): Promise<void> { await this.load(this.surveyId(), this.roundId(), this.segmentId()); }

  printReport(): void {
    if (this.loading() || this.error() || !this.report()) return;
    window.print();
  }

  selectRound(roundId: string): void {
    if (!this.report()?.rounds.some(round => round.id === roundId)) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { roundId, segmentId: null }, queryParamsHandling: 'merge' });
  }

  selectSegment(segmentId: string): void {
    if (!this.report()?.segments.some(segment => segment.id === segmentId)) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { roundId: this.report()?.selectedRound?.id ?? null, segmentId }, queryParamsHandling: 'merge' });
  }

  percentage(value: number | null): string { return value === null ? '—' : `${value}%`; }
  count(value: number | null): string { return value === null ? '—' : String(value); }
  text(value: string | null): string { return value === null || value === '' ? '—' : value; }
  comparable(value: boolean): string { return value ? 'قابل للمقارنة' : 'غير قابل للمقارنة'; }
  change(value: number | null): string { return value === null ? '—' : value > 0 ? `+${value}` : String(value); }
  trendValue(points: SurveyTrendPoint[], roundId: string): string { return this.percentage(points.find(point => point.roundId === roundId)?.value ?? null); }
  participationPoint(points: SurveyParticipationTrendPoint[], roundId: string): SurveyParticipationTrendPoint | undefined { return points.find(point => point.roundId === roundId); }
  comparisonTypeLabel(value: string): string {
    switch (value) {
      case 'PREVIOUS_ROUND': return 'الجولة السابقة';
      case 'SIMILAR_SCHOOLS': return 'مدارس مشابهة';
      case 'EXTERNAL_BENCHMARK': return 'مرجع خارجي';
      default: return value;
    }
  }
  statusLabel(value: string): string {
    switch (value) {
      case 'DRAFT': return 'مسودة';
      case 'ACTIVE': return 'نشط';
      case 'CLOSED': return 'مغلق';
      default: return value;
    }
  }

  private key(surveyId: string | null, roundId: string | null, segmentId: string | null): string {
    return `${surveyId ?? ''}|${roundId ?? ''}|${segmentId ?? ''}`;
  }

  private async load(surveyId: string | null, roundId: string | null, segmentId: string | null): Promise<void> {
    const version = ++this.requestVersion;
    this.report.set(null);
    this.error.set('');
    this.loading.set(Boolean(surveyId));
    if (!surveyId) { this.error.set('الاستبيان غير متاح.'); return; }
    try {
      const report = await this.api.getSurveyReport(surveyId, { roundId: roundId ?? undefined, segmentId: segmentId ?? undefined });
      if (version !== this.requestVersion) return;
      this.report.set(report);
      const canonicalRound = report.selectedRound?.id ?? null;
      const canonicalSegment = report.selectedSegment?.id ?? null;
      this.loadedKey = this.key(surveyId, canonicalRound, canonicalSegment);
      if (roundId !== canonicalRound || segmentId !== canonicalSegment) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: { roundId: canonicalRound, segmentId: canonicalSegment }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.loadedKey = this.key(surveyId, roundId, segmentId);
      this.error.set(error instanceof SurveyReportReadError
        ? ({ SURVEY_NOT_FOUND: 'الاستبيان غير موجود أو غير متاح.', SURVEY_ROUND_NOT_FOUND: 'الجولة المطلوبة غير موجودة في هذا الاستبيان.', SURVEY_SEGMENT_NOT_FOUND: 'الشريحة المطلوبة غير موجودة في هذا الاستبيان.' } as Record<string, string>)[error.code ?? ''] ?? 'تعذر تحميل تقرير الاستبيان. حاول مرة أخرى.'
        : 'تعذر تحميل تقرير الاستبيان. حاول مرة أخرى.');
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }
}
