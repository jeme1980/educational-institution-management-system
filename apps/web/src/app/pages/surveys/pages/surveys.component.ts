import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { SurveyWriteError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiBadgeComponent, UiBadgeTone } from '../../../shared/components/ui-badge/ui-badge.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { UiTextareaComponent } from '../../../shared/components/textarea/ui-textarea.component';
import { getAllowedSurveyStatusOptions } from '../models/survey.model';
import type { CreateSurveyRequest, SurveyListItem, SurveyStatus, UpdateSurveyRequest } from '../models/survey.model';

const nonBlank = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-surveys',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink, UiBadgeComponent, UiButtonComponent, UiEmptyStateComponent, UiInputComponent, UiModalComponent, UiPageHeaderComponent, UiSelectComponent, UiTableActionsComponent, UiTextareaComponent],
  templateUrl: './surveys.component.html',
  styleUrl: './surveys.component.css',
})
export class SurveysComponent {
  readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly surveysApi = inject(SurveysApiService);
  private readonly fb = inject(FormBuilder);
  readonly canUpdate = computed(() => this.auth.hasPermission('surveys:update'));
  readonly canRead = computed(() => this.auth.hasPermission('surveys:read'));
  readonly surveys = signal<SurveyListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly search = signal('');
  readonly editing = signal<SurveyListItem | null>(null);
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly notice = signal('');
  readonly form = this.fb.nonNullable.group({
    nameAr: ['', [nonBlank, Validators.maxLength(500)]],
    nameHe: ['', Validators.maxLength(500)],
    descriptionAr: ['', Validators.maxLength(10_000)],
    descriptionHe: ['', Validators.maxLength(10_000)],
    audienceType: ['', Validators.maxLength(40)],
    status: this.fb.nonNullable.control<SurveyStatus>('DRAFT', Validators.required),
    isActive: true,
  });
  readonly selectedYear = computed(() => this.api.academicYears().find(year => year.id === this.api.selectedAcademicYearId()) || null);
  readonly filteredSurveys = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('ar');
    return this.surveys().filter(item => !query || [item.nameAr, item.nameHe].some(value => value?.toLocaleLowerCase('ar').includes(query)));
  });
  private requestId = 0;
  private modalYearId: string | null = null;

  constructor() {
    effect(() => {
      const academicYearId = this.api.selectedAcademicYearId();
      if (untracked(this.modalOpen) && this.modalYearId !== academicYearId) untracked(() => this.closeModal());
      this.search.set('');
      void this.load(academicYearId);
    });
  }

  async retry(): Promise<void> { await this.load(this.api.selectedAcademicYearId()); }

  openCreate(): void {
    if (!this.canUpdate() || !this.api.selectedAcademicYearId()) return;
    this.editing.set(null);
    this.form.reset({ nameAr: '', nameHe: '', descriptionAr: '', descriptionHe: '', audienceType: '', status: 'DRAFT', isActive: true });
    this.saveError.set('');
    this.notice.set('');
    this.modalYearId = this.api.selectedAcademicYearId();
    this.modalOpen.set(true);
  }

  openEdit(survey: SurveyListItem): void {
    if (!this.canUpdate() || survey.academicYearId !== this.api.selectedAcademicYearId()) return;
    this.editing.set(survey);
    this.form.reset({
      nameAr: survey.nameAr, nameHe: survey.nameHe ?? '', descriptionAr: survey.descriptionAr ?? '',
      descriptionHe: survey.descriptionHe ?? '', audienceType: survey.audienceType ?? '',
      status: survey.status, isActive: survey.isActive,
    });
    this.saveError.set('');
    this.notice.set('');
    this.modalYearId = survey.academicYearId;
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.modalYearId = null;
  }

  async save(): Promise<void> {
    if (this.saving() || !this.modalOpen() || !this.canUpdate()) return;
    const yearId = this.api.selectedAcademicYearId();
    if (!yearId || yearId !== this.modalYearId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const nullable = (text: string): string | null => text.trim() || null;
    const fields = {
      nameAr: value.nameAr.trim(), nameHe: nullable(value.nameHe),
      descriptionAr: nullable(value.descriptionAr), descriptionHe: nullable(value.descriptionHe),
      audienceType: nullable(value.audienceType), status: value.status,
    };
    const editing = this.editing();
    this.saving.set(true);
    this.saveError.set('');
    try {
      if (editing) {
        const payload: UpdateSurveyRequest = { ...fields, isActive: value.isActive };
        await this.surveysApi.updateSurvey(editing.id, payload);
      } else {
        const payload: CreateSurveyRequest = { academicYearId: yearId, ...fields };
        await this.surveysApi.createSurvey(payload);
      }
      this.modalOpen.set(false);
      this.modalYearId = null;
      this.notice.set(editing ? 'تم تحديث الاستبيان.' : 'تم إنشاء الاستبيان.');
      await this.load(this.api.selectedAcademicYearId());
    } catch (error) {
      this.saveError.set(error instanceof SurveyWriteError && error.code === 'SURVEY_ARCHIVED'
        ? 'تعذر حفظ التعديلات لأن الاستبيان مؤرشف.' : 'تعذر حفظ الاستبيان. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      this.saving.set(false);
    }
  }

  allowedStatuses(): readonly SurveyStatus[] {
    return getAllowedSurveyStatusOptions(this.editing()?.status ?? null);
  }

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
