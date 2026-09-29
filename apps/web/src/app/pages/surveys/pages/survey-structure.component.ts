import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SurveyWriteError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { UiTextareaComponent } from '../../../shared/components/textarea/ui-textarea.component';
import type { CreateSurveyDomainRequest, CreateSurveySectionRequest, SurveyDetail, SurveyDomain, SurveySection, UpdateSurveyDomainRequest, UpdateSurveySectionRequest } from '../models/survey.model';

const nonBlank = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-survey-structure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink, UiButtonComponent, UiEmptyStateComponent, UiInputComponent, UiModalComponent, UiPageHeaderComponent, UiSelectComponent, UiTableActionsComponent, UiTextareaComponent],
  templateUrl: './survey-structure.component.html',
  styleUrl: './survey-structure.component.css',
})
export class SurveyStructureComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly api = inject(SurveysApiService);
  private readonly fb = inject(FormBuilder);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly surveyId = computed(() => this.params().get('surveyId'));
  readonly canUpdate = computed(() => this.auth.hasPermission('surveys:update') && !this.survey()?.archivedAt);
  readonly survey = signal<SurveyDetail | null>(null);
  readonly sections = signal<SurveySection[]>([]);
  readonly selectedSectionId = signal<string | null>(null);
  readonly selectedSection = computed(() => this.sections().find(section => section.id === this.selectedSectionId()) ?? null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly notice = signal('');
  readonly saveError = signal('');
  readonly saving = signal(false);
  readonly modalOpen = signal(false);
  readonly mode = signal<'section' | 'domain'>('section');
  readonly editingSection = signal<SurveySection | null>(null);
  readonly editingDomain = signal<SurveyDomain | null>(null);
  readonly form = this.fb.nonNullable.group({
    code: ['', [nonBlank, Validators.maxLength(80)]],
    nameAr: ['', [nonBlank, Validators.maxLength(500)]],
    nameHe: ['', Validators.maxLength(500)],
    descriptionAr: ['', Validators.maxLength(10000)],
    descriptionHe: ['', Validators.maxLength(10000)],
    sortOrder: ['0', [Validators.pattern(/^\d+$/), Validators.min(0), Validators.max(1000000)]],
    sectionId: '',
    isOptional: false,
    isActive: true,
  });
  private requestId = 0;
  private modalSurveyId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.surveyId();
      if (untracked(this.modalOpen) && this.modalSurveyId !== id) untracked(() => this.closeModal());
      void this.load(id, false);
    });
  }

  async retry(): Promise<void> { await this.load(this.surveyId(), false); }

  private async load(id: string | null, preserveSelection: boolean, preferredId?: string): Promise<void> {
    const requestId = ++this.requestId;
    const previousId = preserveSelection ? preferredId ?? this.selectedSectionId() : null;
    this.loading.set(Boolean(id));
    this.error.set(false);
    if (!preserveSelection) {
      this.survey.set(null);
      this.sections.set([]);
      this.selectedSectionId.set(null);
    }
    if (!id) { this.error.set(true); return; }
    try {
      const structure = await this.api.getSurveyStructure(id);
      if (requestId !== this.requestId) return;
      this.survey.set(structure.survey);
      this.sections.set(structure.sections);
      this.selectedSectionId.set(structure.sections.some(section => section.id === previousId) ? previousId : structure.sections[0]?.id ?? null);
    } catch {
      if (requestId === this.requestId) this.error.set(true);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  selectSection(section: SurveySection): void { this.selectedSectionId.set(section.id); }

  openCreateSection(): void {
    if (!this.canUpdate() || !this.survey()) return;
    this.mode.set('section');
    this.editingSection.set(null);
    this.editingDomain.set(null);
    this.resetForm();
  }

  openEditSection(section: SurveySection): void {
    if (!this.canUpdate() || section.surveyId !== this.surveyId()) return;
    this.mode.set('section');
    this.editingSection.set(section);
    this.editingDomain.set(null);
    this.resetForm(section);
  }

  openCreateDomain(): void {
    if (!this.canUpdate() || !this.selectedSection()) return;
    this.mode.set('domain');
    this.editingSection.set(null);
    this.editingDomain.set(null);
    this.resetForm();
  }

  openEditDomain(domain: SurveyDomain): void {
    if (!this.canUpdate() || domain.surveyId !== this.surveyId() || domain.sectionId !== this.selectedSectionId()) return;
    this.mode.set('domain');
    this.editingSection.set(null);
    this.editingDomain.set(domain);
    this.resetForm(domain);
  }

  private resetForm(item?: SurveySection | SurveyDomain): void {
    this.form.reset({
      code: item?.code ?? '', nameAr: item?.nameAr ?? '', nameHe: item?.nameHe ?? '',
      descriptionAr: item?.descriptionAr ?? '', descriptionHe: item?.descriptionHe ?? '',
      sortOrder: String(item?.sortOrder ?? 0),
      sectionId: item && 'sectionId' in item ? item.sectionId : this.selectedSectionId() ?? '',
      isOptional: item && 'isOptional' in item ? item.isOptional : false,
      isActive: item?.isActive ?? true,
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
    const id = this.surveyId();
    if (!id || id !== this.modalSurveyId || !this.survey()) return;
    const value = this.form.getRawValue();
    const nullable = (text: string): string | null => text.trim() || null;
    const common = {
      code: value.code.trim(), nameAr: value.nameAr.trim(), nameHe: nullable(value.nameHe),
      descriptionAr: nullable(value.descriptionAr), descriptionHe: nullable(value.descriptionHe),
      sortOrder: Number(value.sortOrder), isActive: value.isActive,
    };
    const editingSection = this.editingSection();
    const editingDomain = this.editingDomain();
    this.saving.set(true);
    this.saveError.set('');
    try {
      let preferredId = this.selectedSectionId() ?? undefined;
      if (this.mode() === 'section') {
        const fields: CreateSurveySectionRequest = { ...common, isOptional: value.isOptional };
        if (editingSection) {
          const payload: UpdateSurveySectionRequest = { ...fields };
          if (payload.code === editingSection.code) delete payload.code;
          await this.api.updateSurveySection(id, editingSection.id, payload);
        } else {
          const created = await this.api.createSurveySection(id, fields);
          preferredId = created.id;
        }
      } else {
        const sectionId = editingDomain ? value.sectionId : this.selectedSectionId();
        if (!sectionId || !this.sections().some(section => section.id === sectionId)) return;
        const fields: CreateSurveyDomainRequest = { ...common, sectionId };
        if (editingDomain) {
          const payload: UpdateSurveyDomainRequest = { ...fields };
          if (payload.code === editingDomain.code) delete payload.code;
          if (payload.sectionId === editingDomain.sectionId) delete payload.sectionId;
          await this.api.updateSurveyDomain(id, editingDomain.id, payload);
        } else {
          await this.api.createSurveyDomain(id, fields);
        }
        preferredId = sectionId;
      }
      this.modalOpen.set(false);
      this.modalSurveyId = null;
      if (this.surveyId() === id) {
        this.notice.set(editingSection || editingDomain ? 'تم حفظ التعديل.' : 'تمت الإضافة.');
        await this.load(id, true, preferredId);
      }
    } catch (error) {
      const code = error instanceof SurveyWriteError ? error.code : null;
      this.saveError.set(({
        SURVEY_ARCHIVED: 'لا يمكن تعديل استبيان مؤرشف.',
        SURVEY_STRUCTURE_LOCKED: 'لا يمكن تعديل هذا الحقل بعد تسجيل نتائج للاستبيان.',
        DUPLICATE_SURVEY_SECTION_CODE: 'رمز القسم مستخدم بالفعل في هذا الاستبيان.',
        DUPLICATE_SURVEY_DOMAIN_CODE: 'رمز المجال مستخدم بالفعل في هذا الاستبيان.',
      } as Record<string, string>)[code ?? ''] ?? 'تعذر حفظ التغييرات. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      this.saving.set(false);
    }
  }
}
