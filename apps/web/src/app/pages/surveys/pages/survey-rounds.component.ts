import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { SURVEY_ROUND_STATUSES } from '../models/survey.model';
import type { CreateSurveyRoundRequest, SurveyDetail, SurveyRound, SurveyRoundStatus, UpdateSurveyRoundRequest } from '../models/survey.model';

const nonBlank = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };
const dateOrder: ValidatorFn = control => {
  const start = control.get('startsAt')?.value as string | undefined;
  const end = control.get('endsAt')?.value as string | undefined;
  return start && end && start > end ? { dateOrder: true } : null;
};
const dateValue = (value: string | null): string => value?.slice(0, 10) ?? '';

@Component({
  selector: 'app-survey-rounds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink, UiBadgeComponent, UiButtonComponent, UiEmptyStateComponent, UiInputComponent, UiModalComponent, UiPageHeaderComponent, UiSelectComponent, UiTableActionsComponent],
  templateUrl: './survey-rounds.component.html',
  styleUrl: './survey-rounds.component.css',
})
export class SurveyRoundsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly surveysApi = inject(SurveysApiService);
  private readonly fb = inject(FormBuilder);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly surveyId = computed(() => this.params().get('surveyId'));
  readonly canUpdate = computed(() => this.auth.hasPermission('surveys:update'));
  readonly survey = signal<SurveyDetail | null>(null);
  readonly rounds = signal<SurveyRound[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly notice = signal('');
  readonly editing = signal<SurveyRound | null>(null);
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly statuses = SURVEY_ROUND_STATUSES;
  readonly form = this.fb.nonNullable.group({
    code: ['', [nonBlank, Validators.maxLength(80)]],
    nameAr: ['', [nonBlank, Validators.maxLength(500)]],
    nameHe: ['', Validators.maxLength(500)],
    sequenceNumber: ['1', [Validators.required, Validators.pattern(/^\d+$/), Validators.min(1)]],
    startsAt: '',
    endsAt: '',
    measurementDate: '',
    status: this.fb.nonNullable.control<SurveyRoundStatus>('PLANNED', Validators.required),
  }, { validators: dateOrder });
  private requestId = 0;
  private modalSurveyId: string | null = null;

  constructor() {
    effect(() => {
      const surveyId = this.surveyId();
      if (untracked(this.modalOpen) && this.modalSurveyId !== surveyId) untracked(() => this.closeModal());
      void this.load(surveyId);
    });
  }

  async retry(): Promise<void> { await this.load(this.surveyId()); }

  openResultsPreview(round: SurveyRound): void {
    const surveyId = this.surveyId();
    if (!surveyId || !this.canUpdate() || this.survey()?.archivedAt || round.surveyId !== surveyId) return;
    void this.router.navigate(['/surveys', surveyId, 'rounds', round.id, 'results', 'import']);
  }

  private async load(surveyId: string | null): Promise<void> {
    const requestId = ++this.requestId;
    this.survey.set(null);
    this.rounds.set([]);
    this.error.set(false);
    this.loading.set(Boolean(surveyId));
    if (!surveyId) { this.error.set(true); return; }
    try {
      const structure = await this.surveysApi.getSurveyStructure(surveyId);
      if (requestId === this.requestId) {
        this.survey.set(structure.survey);
        this.rounds.set(structure.rounds);
      }
    } catch {
      if (requestId === this.requestId) this.error.set(true);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  openCreate(): void {
    if (!this.canUpdate() || !this.survey() || this.survey()?.archivedAt) return;
    this.editing.set(null);
    this.form.reset({ code: '', nameAr: '', nameHe: '', sequenceNumber: '1', startsAt: '', endsAt: '', measurementDate: '', status: 'PLANNED' });
    this.saveError.set('');
    this.notice.set('');
    this.modalSurveyId = this.surveyId();
    this.modalOpen.set(true);
  }

  openEdit(round: SurveyRound): void {
    if (!this.canUpdate() || !this.survey() || this.survey()?.archivedAt || round.surveyId !== this.surveyId()) return;
    this.editing.set(round);
    this.form.reset({
      code: round.code, nameAr: round.nameAr, nameHe: round.nameHe ?? '', sequenceNumber: String(round.sequenceNumber),
      startsAt: dateValue(round.startsAt), endsAt: dateValue(round.endsAt), measurementDate: dateValue(round.measurementDate), status: round.status,
    });
    this.saveError.set('');
    this.notice.set('');
    this.modalSurveyId = this.surveyId();
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.modalSurveyId = null;
  }

  async save(): Promise<void> {
    if (this.saving() || !this.modalOpen() || !this.canUpdate() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const surveyId = this.surveyId();
    if (!surveyId || surveyId !== this.modalSurveyId || !this.survey() || this.survey()?.archivedAt) return;
    const value = this.form.getRawValue();
    const nullable = (text: string): string | null => text.trim() || null;
    const fields: CreateSurveyRoundRequest = {
      code: value.code.trim(), nameAr: value.nameAr.trim(), nameHe: nullable(value.nameHe),
      sequenceNumber: Number(value.sequenceNumber), startsAt: nullable(value.startsAt), endsAt: nullable(value.endsAt),
      measurementDate: nullable(value.measurementDate), status: value.status,
    };
    const editing = this.editing();
    this.saving.set(true);
    this.saveError.set('');
    try {
      if (editing) {
        const payload: UpdateSurveyRoundRequest = { ...fields };
        if (payload.code === editing.code) delete payload.code;
        if (payload.sequenceNumber === editing.sequenceNumber) delete payload.sequenceNumber;
        await this.surveysApi.updateSurveyRound(surveyId, editing.id, payload);
      } else {
        await this.surveysApi.createSurveyRound(surveyId, fields);
      }
      this.modalOpen.set(false);
      this.modalSurveyId = null;
      if (this.surveyId() === surveyId) {
        this.notice.set(editing ? 'تم تحديث الجولة.' : 'تم إنشاء الجولة.');
        await this.load(surveyId);
      }
    } catch (error) {
      const code = error instanceof SurveyWriteError ? error.code : null;
      this.saveError.set(({
        SURVEY_ARCHIVED: 'تعذر الحفظ لأن الاستبيان مؤرشف.',
        SURVEY_STRUCTURE_LOCKED: 'تعذر تغيير رمز الجولة أو ترتيبها بعد تسجيل نتائج للاستبيان.',
        DUPLICATE_SURVEY_ROUND_CODE: 'رمز الجولة أو ترتيبها مستخدم بالفعل في هذا الاستبيان.',
        INVALID_SURVEY_ROUND_DATES: 'تحقق من ترتيب التواريخ وأن تاريخ القياس ضمن السنة الدراسية.',
      } as Record<string, string>)[code ?? ''] ?? 'تعذر حفظ الجولة. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      this.saving.set(false);
    }
  }

  statusLabel(status: SurveyRoundStatus): string {
    return ({ PLANNED: 'مخططة', OPEN: 'مفتوحة', CLOSED: 'مغلقة' } satisfies Record<SurveyRoundStatus, string>)[status];
  }

  statusTone(status: SurveyRoundStatus): UiBadgeTone {
    return ({ PLANNED: 'neutral', OPEN: 'success', CLOSED: 'warning' } satisfies Record<SurveyRoundStatus, UiBadgeTone>)[status];
  }
}
