import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SurveyComparisonsReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import type { SurveyComparisonsResponse, SurveyResultNamedItem } from '../models/survey.model';

@Component({
  selector: 'app-survey-comparisons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatIconModule, RouterLink, UiButtonComponent, UiEmptyStateComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent],
  templateUrl: './survey-comparisons.component.html',
  styleUrl: './survey-comparisons.component.css',
})
export class SurveyComparisonsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(SurveysApiService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly surveyId = computed(() => this.params().get('surveyId'));
  readonly result = signal<SurveyComparisonsResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedRoundId = signal<string | null>(null);
  readonly selectedSegmentId = signal<string | null>(null);
  readonly roundGroups = computed(() => this.result()?.groups.filter(group => group.roundId === this.selectedRoundId()) ?? []);
  readonly segments = computed<SurveyResultNamedItem[]>(() => {
    const seen = new Set<string>();
    return this.roundGroups().flatMap(group => {
      if (seen.has(group.segment.id)) return [];
      seen.add(group.segment.id);
      return [group.segment];
    });
  });
  readonly visibleGroups = computed(() => this.roundGroups().filter(group => group.segmentId === this.selectedSegmentId()));
  private requestVersion = 0;

  constructor() { effect(() => { void this.load(this.surveyId()); }); }

  async retry(): Promise<void> { await this.load(this.surveyId()); }

  selectRound(id: string): void {
    if (!this.result()?.rounds.some(round => round.id === id)) return;
    this.selectedRoundId.set(id);
    this.selectedSegmentId.set(this.segments()[0]?.id ?? null);
  }

  selectSegment(id: string): void {
    if (this.segments().some(segment => segment.id === id)) this.selectedSegmentId.set(id);
  }

  comparisonTypeLabel(value: string): string {
    switch (value) {
      case 'PREVIOUS_ROUND': return 'الجولة السابقة';
      case 'SIMILAR_SCHOOLS': return 'مدارس مشابهة';
      case 'EXTERNAL_BENCHMARK': return 'مرجع خارجي';
      default: return value;
    }
  }

  percentage(value: number | null): string { return value === null ? '—' : `${value}%`; }
  count(value: number | null): string { return value === null ? '—' : String(value); }
  text(value: string | null): string { return value === null ? '—' : value; }
  comparable(value: boolean): string { return value ? 'قابل للمقارنة' : 'غير قابل للمقارنة'; }

  private async load(surveyId: string | null): Promise<void> {
    const version = ++this.requestVersion;
    this.result.set(null);
    this.selectedRoundId.set(null);
    this.selectedSegmentId.set(null);
    this.error.set('');
    this.loading.set(Boolean(surveyId));
    if (!surveyId) { this.error.set('الاستبيان غير متاح.'); return; }
    try {
      const value = await this.api.getSurveyComparisons(surveyId);
      if (version !== this.requestVersion) return;
      this.result.set(value);
      const firstRound = value.rounds[0];
      if (firstRound) this.selectRound(firstRound.id);
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.error.set(error instanceof SurveyComparisonsReadError && error.code === 'SURVEY_NOT_FOUND'
        ? 'الاستبيان غير موجود أو غير متاح.'
        : error instanceof SurveyComparisonsReadError && error.status === 403
          ? 'ليس لديك صلاحية لعرض مقارنات الاستبيان.'
          : 'تعذر تحميل مقارنات الاستبيان. حاول مرة أخرى.');
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }
}
