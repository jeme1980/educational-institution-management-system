import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiBadgeComponent, UiBadgeTone } from '../../../shared/components/ui-badge/ui-badge.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import type { SurveyListItem, SurveyStatus } from '../models/survey.model';

@Component({
  selector: 'app-surveys',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, UiBadgeComponent, UiButtonComponent, UiEmptyStateComponent, UiInputComponent, UiPageHeaderComponent],
  templateUrl: './surveys.component.html',
  styleUrl: './surveys.component.css',
})
export class SurveysComponent {
  readonly api = inject(ApiService);
  private readonly surveysApi = inject(SurveysApiService);
  readonly surveys = signal<SurveyListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly search = signal('');
  readonly selectedYear = computed(() => this.api.academicYears().find(year => year.id === this.api.selectedAcademicYearId()) || null);
  readonly filteredSurveys = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('ar');
    return this.surveys().filter(item => !query || [item.nameAr, item.nameHe].some(value => value?.toLocaleLowerCase('ar').includes(query)));
  });
  private requestId = 0;

  constructor() {
    effect(() => {
      const academicYearId = this.api.selectedAcademicYearId();
      this.search.set('');
      void this.load(academicYearId);
    });
  }

  async retry(): Promise<void> { await this.load(this.api.selectedAcademicYearId()); }

  private async load(academicYearId: string | null): Promise<void> {
    const requestId = ++this.requestId;
    this.surveys.set([]);
    this.error.set(false);
    this.loading.set(Boolean(academicYearId));
    if (!academicYearId) return;
    try {
      const items = await this.surveysApi.getSurveys(academicYearId);
      if (requestId === this.requestId) this.surveys.set(items);
    } catch {
      if (requestId === this.requestId) this.error.set(true);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  statusLabel(status: SurveyStatus): string {
    return ({ DRAFT: 'مسودة', ACTIVE: 'نشط', CLOSED: 'مغلق' } satisfies Record<SurveyStatus, string>)[status];
  }

  statusTone(status: SurveyStatus): UiBadgeTone {
    return ({ DRAFT: 'neutral', ACTIVE: 'success', CLOSED: 'warning' } satisfies Record<SurveyStatus, UiBadgeTone>)[status];
  }

  updateSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
}
