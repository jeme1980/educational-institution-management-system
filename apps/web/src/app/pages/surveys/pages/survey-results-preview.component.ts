import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SurveyPreviewError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import type { SurveyDetail, SurveyResultsPreviewResponse, SurveyRound } from '../models/survey.model';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

@Component({
  selector: 'app-survey-results-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink, UiButtonComponent, UiPageHeaderComponent],
  templateUrl: './survey-results-preview.component.html',
  styleUrl: './survey-results-preview.component.css',
})
export class SurveyResultsPreviewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly api = inject(SurveysApiService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly surveyId = computed(() => this.params().get('surveyId'));
  readonly roundId = computed(() => this.params().get('roundId'));
  readonly survey = signal<SurveyDetail | null>(null);
  readonly round = signal<SurveyRound | null>(null);
  readonly loading = signal(false);
  readonly contextError = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal('');
  readonly preview = signal<SurveyResultsPreviewResponse | null>(null);
  readonly previewTotalRows = computed(() => {
    const summary = this.preview()?.summary;
    return summary ? summary.indicatorRowsTotal + summary.domainRowsTotal + summary.comparisonRowsTotal + summary.participationRowsTotal : 0;
  });
  readonly isPreviewImportReady = computed(() => this.preview()?.valid === true && this.previewTotalRows() > 0);
  readonly previewError = signal('');
  readonly previewing = signal(false);
  readonly templateDownloading = signal(false);
  readonly templateError = signal('');
  readonly canDownloadTemplate = computed(() => this.auth.hasPermission('surveys:read'));
  readonly canPreview = computed(() => this.auth.hasPermission('surveys:update') && Boolean(this.survey() && this.round() && !this.survey()?.archivedAt));
  private requestVersion = 0;

  constructor() {
    effect(() => { void this.load(this.surveyId(), this.roundId()); });
  }

  async retry(): Promise<void> { await this.load(this.surveyId(), this.roundId()); }

  private async load(surveyId: string | null, roundId: string | null): Promise<void> {
    const version = ++this.requestVersion;
    this.survey.set(null);
    this.round.set(null);
    this.selectedFile.set(null);
    this.fileError.set('');
    this.preview.set(null);
    this.previewError.set('');
    this.previewing.set(false);
    this.contextError.set('');
    this.loading.set(Boolean(surveyId && roundId));
    if (!surveyId || !roundId) {
      this.contextError.set('رابط الاستبيان أو الجولة غير صالح.');
      return;
    }
    try {
      const structure = await this.api.getSurveyStructure(surveyId);
      if (version !== this.requestVersion) return;
      const round = structure.rounds.find(item => item.id === roundId);
      if (!round) {
        this.contextError.set('الجولة غير موجودة أو لا تتبع هذا الاستبيان.');
        return;
      }
      this.survey.set(structure.survey);
      this.round.set(round);
    } catch {
      if (version === this.requestVersion) this.contextError.set('تعذر تحميل الاستبيان والجولة. حاول مرة أخرى.');
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    ++this.requestVersion;
    this.previewing.set(false);
    this.preview.set(null);
    this.previewError.set('');
    this.selectedFile.set(file);
    this.fileError.set(!file ? '' : !/\.xlsx$/i.test(file.name)
      ? 'اختر ملف Excel بصيغة .xlsx فقط.'
      : file.size > MAX_FILE_BYTES ? 'حجم الملف يتجاوز الحد المسموح (10 MB).' : '');
  }

  clearFile(input: HTMLInputElement): void {
    input.value = '';
    this.onFileChange({ target: input } as unknown as Event);
  }

  fileSize(file: File): string { return `${(file.size / (1024 * 1024)).toFixed(2)} MB`; }

  async downloadTemplate(): Promise<void> {
    if (!this.canDownloadTemplate() || this.templateDownloading()) return;
    this.templateDownloading.set(true);
    this.templateError.set('');
    try {
      const blob = await this.api.downloadSurveyResultsTemplate();
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'survey-results-template.xlsx';
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      this.templateError.set('تعذر تنزيل قالب Excel. حاول مرة أخرى.');
    } finally {
      this.templateDownloading.set(false);
    }
  }

  async runPreview(): Promise<void> {
    const file = this.selectedFile();
    const surveyId = this.surveyId();
    const roundId = this.roundId();
    if (!file || this.fileError() || this.previewing() || !this.canPreview() || !surveyId || !roundId) return;
    const version = ++this.requestVersion;
    this.preview.set(null);
    this.previewError.set('');
    this.previewing.set(true);
    try {
      const result = await this.api.previewSurveyResults(surveyId, roundId, file);
      if (version === this.requestVersion) this.preview.set(result);
    } catch (error) {
      if (version !== this.requestVersion) return;
      const code = error instanceof SurveyPreviewError ? error.code : null;
      this.previewError.set(({
        SURVEY_EXCEL_FILE_REQUIRED: 'لم يتم اختيار ملف.',
        UNSUPPORTED_SPREADSHEET_TYPE: 'ملف Excel غير صالح أو غير مدعوم.',
        INVALID_MULTIPART_UPLOAD: 'ملف Excel غير صالح أو غير مدعوم.',
        MULTIPART_FORM_DATA_REQUIRED: 'تعذر إرسال الملف. حاول مرة أخرى.',
        MULTIPLE_FILES_NOT_ALLOWED: 'اختر ملف Excel واحدًا فقط.',
        MALFORMED_WORKBOOK: 'ملف Excel غير صالح أو غير مدعوم.',
        PAYLOAD_TOO_LARGE: 'حجم الملف يتجاوز الحد المسموح (10 MB).',
        SURVEY_NOT_FOUND: 'الاستبيان غير موجود أو غير متاح.',
        SURVEY_ROUND_NOT_FOUND: 'الجولة غير موجودة أو لا تتبع هذا الاستبيان.',
        SURVEY_ARCHIVED: 'لا يمكن استيراد نتائج لاستبيان مؤرشف.',
      } as Record<string, string>)[code ?? ''] ?? 'تعذر فحص الملف. حاول مرة أخرى.');
    } finally {
      if (version === this.requestVersion) this.previewing.set(false);
    }
  }
}
