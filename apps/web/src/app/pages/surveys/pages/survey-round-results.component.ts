import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SurveyResultsReadError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import type { SurveyRoundResultsResponse } from '../models/survey.model';

@Component({
  selector: 'app-survey-round-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, RouterLink, UiButtonComponent, UiEmptyStateComponent, UiPageHeaderComponent, UiSectionCardComponent],
  templateUrl: './survey-round-results.component.html',
  styleUrl: './survey-round-results.component.css',
})
export class SurveyRoundResultsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(SurveysApiService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly surveyId = computed(() => this.params().get('surveyId'));
  readonly roundId = computed(() => this.params().get('roundId'));
  readonly result = signal<SurveyRoundResultsResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly noResults = computed(() => {
    const value = this.result();
    return Boolean(value && !value.indicatorResults.length && !value.domainResults.length && !value.comparisons.length && !value.participation.length);
  });
  private requestVersion = 0;

  constructor() { effect(() => { void this.load(this.surveyId(), this.roundId()); }); }

  async retry(): Promise<void> { await this.load(this.surveyId(), this.roundId()); }

  private async load(surveyId: string | null, roundId: string | null): Promise<void> {
    const version = ++this.requestVersion;
    this.result.set(null);
    this.error.set('');
    this.loading.set(Boolean(surveyId && roundId));
    if (!surveyId || !roundId) {
      this.error.set('الاستبيان أو الجولة غير متاحين.');
      return;
    }
    try {
      const value = await this.api.getSurveyRoundResults(surveyId, roundId);
      if (version === this.requestVersion) this.result.set(value);
    } catch (error) {
      if (version !== this.requestVersion) return;
      const code = error instanceof SurveyResultsReadError ? error.code : null;
      const status = error instanceof SurveyResultsReadError ? error.status : null;
      this.error.set(code === 'SURVEY_NOT_FOUND' ? 'الاستبيان غير موجود أو غير متاح.'
        : code === 'SURVEY_ROUND_NOT_FOUND' ? 'الجولة غير موجودة أو لا تتبع هذا الاستبيان.'
        : status === 403 ? 'ليس لديك صلاحية لعرض نتائج الجولة.'
        : 'تعذر تحميل نتائج الجولة. حاول مرة أخرى.');
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }

  percentage(value: number | null): string { return value === null ? '—' : `${value}%`; }
  comparisonTypeLabel(value: string): string {
    return ({ PREVIOUS_ROUND: 'الجولة السابقة', SIMILAR_SCHOOLS: 'مدارس مشابهة', EXTERNAL_BENCHMARK: 'مرجع خارجي' } as Record<string, string>)[value] ?? value;
  }
  importStatusLabel(value: string): string { return value === 'COMPLETED' ? 'مكتمل' : value; }
}
