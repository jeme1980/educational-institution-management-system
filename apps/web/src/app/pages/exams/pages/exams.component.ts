import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, ExamItem } from '../../../core/services/api.service';
import { ExamsStateService } from '../services/exams-state.service';
import { QuestionRow } from '../models/exam.model';
import { ExamTableComponent } from '../components/exam-table';
import { ExamResultsDialogComponent } from '../components/exam-results-dialog';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';

type QuestionContext = { topics: any[]; skills: any[]; gradeLevels: any[]; warning: string | null };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-exams',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, ExamTableComponent, ExamResultsDialogComponent, UiButtonComponent, UiPageHeaderComponent, UiStatCardComponent],
  templateUrl: './exams.component.html',
  styleUrl: './exams.component.css',
})
export class ExamsComponent implements OnInit {
  readonly confirmDialog = inject(ConfirmDialogService);
  readonly apiService = inject(ApiService);
  readonly state = inject(ExamsStateService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly search = signal('');
  readonly subjectFilter = signal('');
  readonly academicPeriodFilter = signal('');
  readonly publishedFilter = signal('');
  readonly resultSearch = signal('');
  readonly showModal = signal(false);
  readonly showResultsPanel = signal(false);
  // Legacy results markup remains in the template for backward compatibility; the active flow uses showResultsPanel.
  readonly showResults = signal(false);
  readonly showStudyGroups = signal(false);
  readonly showQuestions = signal(false);
  readonly editing = signal<ExamItem | null>(null);
  readonly selectedExam = signal<ExamItem | null>(null);
  readonly results = signal<any[]>([]);
  readonly selectedGroupIds = signal<string[]>([]);
  readonly questionContext = signal<QuestionContext>({ topics: [], skills: [], gradeLevels: [], warning: null });
  readonly questions = signal<QuestionRow[]>([]);
  readonly resultQuestions = signal<any[]>([]);
  readonly resultsWarning = signal('');
  readonly isLoading = signal(true);
  readonly isLoadingResults = signal(false);
  readonly isLoadingQuestions = signal(false);
  readonly isSaving = signal(false);
  readonly isSavingResults = signal(false);
  readonly isSavingRelations = signal(false);
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly form = this.fb.nonNullable.group({
    titleAr: ['', [Validators.required, Validators.maxLength(250)]],
    titleHe: [''],
    academicPeriodId: ['', Validators.required],
    subjectId: ['', Validators.required],
    examTypeId: ['', Validators.required],
    examDate: ['', Validators.required],
    maxScore: [100, [Validators.required, Validators.min(0.01)]],
    weight: [null as number | null],
    isPublished: [false],
    notes: [''],
  });

  readonly exams = computed(() => this.state.exams());
  readonly filteredExams = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('ar');
    return this.exams().filter(exam =>
      (!this.subjectFilter() || exam.subjectId === this.subjectFilter()) &&
      (!this.academicPeriodFilter() || exam.academicPeriodId === this.academicPeriodFilter()) &&
      (!this.publishedFilter() || String(exam.isPublished) === this.publishedFilter()) &&
      (!query || [exam.titleAr, exam.titleHe, exam.subject?.nameAr, exam.examType?.nameAr, exam.academicPeriod?.nameAr]
        .some(value => String(value || '').toLocaleLowerCase('ar').includes(query))),
    );
  });
  readonly availableStudyGroups = computed(() => {
    const exam = this.selectedExam();
    return this.state.studyGroups().filter(group => group.subjectId === exam?.subjectId && group.academicYearId === exam?.academicYearId);
  });
  readonly selectedGroupGradeLevels = computed(() => [...new Set(this.availableStudyGroups()
    .filter(group => this.selectedGroupIds().includes(group.id))
    .map(group => group.classRoom?.gradeLevel?.id)
    .filter((id): id is string => Boolean(id)))]);
  readonly questionTopics = computed(() => this.questionContext().topics);
  readonly questionSkills = computed(() => this.questionContext().skills);
  readonly filteredResults = computed(() => {
    const query = this.resultSearch().trim().toLocaleLowerCase('ar');
    return this.results().filter(row => !query || [row.studentName, row.nationalId, row.classNameAr]
      .some(value => String(value || '').toLocaleLowerCase('ar').includes(query)));
  });
  readonly recordedResultsCount = computed(() => this.results().filter(row => row.resultId || row.totalScore !== null || row.isAbsence).length);
  readonly questionScoreTotal = computed(() => this.questions().reduce((sum, question) => sum + Number(question.maxScore || 0), 0));
  readonly totalExams = computed(() => this.exams().length);
  readonly unlinkedExams = computed(() => this.exams().filter(exam => !this.hasGroups(exam)).length);
  readonly unpublishedExams = computed(() => this.exams().filter(exam => !exam.isPublished).length);
  readonly fullyRecordedExams = computed(() => this.exams().filter(exam => this.isFullyRecorded(exam)).length);

  ngOnInit(): void { void this.refresh(); }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    await Promise.all([
      this.state.loadExams(),
      this.apiService.loadExamTypes(),
      this.apiService.loadQuestionTypes(),
      this.apiService.loadAcademicPeriods(),
      this.apiService.loadSubjects(),
      this.state.loadStudyGroups(),
    ]);
    this.isLoading.set(false);
  }

  updateSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  updateResultSearch(event: Event): void { this.resultSearch.set((event.target as HTMLInputElement).value); }
  setFilter(name: 'subject' | 'period' | 'published', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (name === 'subject') this.subjectFilter.set(value);
    if (name === 'period') this.academicPeriodFilter.set(value);
    if (name === 'published') this.publishedFilter.set(value);
  }
  clearFilters(): void { this.search.set(''); this.subjectFilter.set(''); this.academicPeriodFilter.set(''); this.publishedFilter.set(''); }

  openAdd(): void {
    void this.router.navigate(['/exams/new']);
  }
  openEdit(exam: ExamItem): void {
    void this.router.navigate(['/exams', exam.id, 'builder'], { state: { exam } });
  }
  closeModal(): void { if (!this.isSaving()) this.showModal.set(false); }
  async save(): Promise<void> {
    if (this.form.invalid || this.isSaving()) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    const editing = Boolean(this.editing());
    const ok = editing ? await this.apiService.updateExam(this.editing()!.id, this.form.getRawValue()) : Boolean(await this.apiService.createExam(this.form.getRawValue()));
    this.isSaving.set(false);
    if (ok) { this.showModal.set(false); this.notify('success', editing ? 'تم تعديل الامتحان.' : 'تمت إضافة الامتحان.'); }
    else this.notify('error', this.apiService.examsApi.error() || 'تعذر حفظ الامتحان.');
  }
  async remove(exam: ExamItem): Promise<void> {
    if (!await this.confirmDialog.confirm({ title: 'أرشفة الامتحان', message: `هل تريد أرشفة الامتحان «${exam.titleAr}»؟`, variant: 'warning' })) return;
    const ok = await this.apiService.deleteExam(exam.id);
    this.notify(ok ? 'success' : 'error', ok ? 'تمت أرشفة الامتحان.' : this.apiService.examsApi.error() || 'تعذر أرشفة الامتحان.');
  }

  async openStudyGroups(exam?: ExamItem): Promise<void> {
    if (exam) this.selectedExam.set(exam);
    const selected = this.selectedExam();
    if (!selected) return;
    this.selectedGroupIds.set((await this.state.loadExamStudyGroups(selected.id)).map((item: any) => item.studyGroupId));
    this.showStudyGroups.set(true);
  }
  toggleStudyGroup(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedGroupIds.update(ids => checked ? [...new Set([...ids, id])] : ids.filter(item => item !== id));
  }
  async saveStudyGroups(): Promise<void> {
    const exam = this.selectedExam();
    if (!exam || this.isSavingRelations()) return;
    this.isSavingRelations.set(true);
    const ok = await this.state.saveExamStudyGroups(exam.id, this.selectedGroupIds());
    this.isSavingRelations.set(false);
    if (ok) { this.showStudyGroups.set(false); await this.refresh(); this.notify('success', 'تم حفظ مجموعات الامتحان.'); }
    else this.notify('error', 'تعذر حفظ مجموعات الامتحان.');
  }

  async openQuestions(exam?: ExamItem): Promise<void> {
    if (exam) { await this.router.navigate(['/exams', exam.id, 'builder'], { state: { exam } }); return; }
    if (exam) this.selectedExam.set(exam);
    const selected = this.selectedExam();
    if (!selected || !this.hasGroups(selected)) return;
    this.isLoadingQuestions.set(true);
    this.showQuestions.set(true);
    const [context, questions] = await Promise.all([this.apiService.loadExamQuestionContext(selected.id), this.state.loadExamQuestions(selected.id)]);
    this.questionContext.set(context);
    this.questions.set(questions);
    this.isLoadingQuestions.set(false);
  }
  addQuestion(): void { this.questions.update(rows => [...rows, { questionNumber: rows.length + 1, questionTypeId: this.apiService.questionTypes()[0]?.id || '', topicId: null, skillId: null, maxScore: 1, contentAr: '' }]); }
  removeQuestion(index: number): void { this.questions.update(rows => rows.filter((_, rowIndex) => rowIndex !== index).map((row, rowIndex) => ({ ...row, questionNumber: rowIndex + 1 }))); }
  async saveQuestions(): Promise<void> {
    const exam = this.selectedExam();
    if (!exam || this.isSavingRelations()) return;
    this.isSavingRelations.set(true);
    const ok = await this.state.saveExamQuestions(exam.id, this.questions());
    this.isSavingRelations.set(false);
    if (ok) { this.showQuestions.set(false); await this.refresh(); this.notify('success', 'تم حفظ أسئلة الامتحان.'); }
    else this.notify('error', 'تعذر حفظ أسئلة الامتحان.');
  }
  async exportQuestionTemplate(): Promise<void> {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('أسئلة الامتحان', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    sheet.columns = [{ header: 'maxScore', key: 'maxScore', width: 18 }, { header: 'contentAr', key: 'contentAr', width: 70 }];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369A1' } };
    sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.autoFilter = 'A1:B1';
    const data = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = url; link.download = `قالب-أسئلة-${this.selectedExam()?.titleAr || 'امتحان'}.xlsx`; link.click(); URL.revokeObjectURL(url);
    this.notify('success', 'تم تنزيل قالب الأسئلة.');
  }
  openQuestionImport(): void { (document.getElementById('question-import-file') as HTMLInputElement | null)?.click(); }
  importQuestions(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rows = await this.readQuestionFile(file, reader.result);
        const typeId = this.apiService.questionTypes()[0]?.id || '';
        if (!typeId) { this.notify('error', 'لا يوجد نوع سؤال افتراضي. أضف نوع سؤال فعال من الإعدادات ثم أعد الاستيراد.'); return; }
        const valid = rows.map((row: any, index: number) => ({ questionNumber: index + 1, questionTypeId: typeId, topicId: null, skillId: null, maxScore: this.toImportNumber(row.maxScore), contentAr: this.importCellText(row.contentAr) })).filter((row: any) => row.contentAr && Number.isFinite(row.maxScore) && row.maxScore > 0);
        if (!valid.length) { this.notify('error', 'لم يتم العثور على أسئلة صالحة. تحقق من عمودي علامة السؤال ونص السؤال.'); return; }
        if (this.questions().length && !await this.confirmDialog.confirm({ title: 'استبدال الأسئلة', message: 'سيؤدي الاستيراد إلى استبدال الأسئلة الحالية غير المحفوظة. هل تريد المتابعة؟', variant: 'warning' })) return;
        this.questions.set(valid); this.notify('success', `تم استيراد ${valid.length} سؤال.`);
      } catch { this.notify('error', 'تعذر قراءة الملف. استخدم قالب XLSX أو CSV المصدّر من النظام.'); }
      (event.target as HTMLInputElement).value = '';
    };
    if (/\.csv$/i.test(file.name)) reader.readAsText(file, 'utf-8'); else reader.readAsArrayBuffer(file);
  }
  private async readQuestionFile(file: File, result: string | ArrayBuffer | null): Promise<any[]> {
    if (/\.csv$/i.test(file.name)) return this.parseQuestionCsvDeep(String(result || ''));
    const ExcelJS = await import('exceljs'); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(result as ArrayBuffer);
    const sheet = workbook.worksheets[0]; if (!sheet) return [];
    const rows: any[][] = []; sheet.eachRow(row => { const values: any[] = []; for (let index = 1; index <= Math.max(2, sheet.columnCount); index++) values.push(row.getCell(index).value); rows.push(values); });
    if (!rows.length) return [];
    let headerRow = -1; let scoreIndex = -1; let textIndex = -1;
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 10); rowIndex++) {
      const headers = rows[rowIndex].map(value => this.normalizeImportHeader(this.importCellText(value)));
      scoreIndex = headers.findIndex(value => ['maxscore', 'score', 'mark', 'علامةالسؤال', 'العلامة'].includes(value));
      textIndex = headers.findIndex(value => ['contentar', 'question', 'text', 'نصالسؤال', 'السؤال'].includes(value));
      if (scoreIndex >= 0 && textIndex >= 0) { headerRow = rowIndex; break; }
    }
    if (headerRow < 0) { scoreIndex = 0; textIndex = 1; headerRow = this.toImportNumber(rows[0]?.[0]) > 0 || this.importCellText(rows[0]?.[1]) ? -1 : 0; }
    const start = headerRow < 0 ? 0 : headerRow + 1;
    return rows.slice(start).map(row => ({ maxScore: this.importCellText(row[scoreIndex]), contentAr: this.importCellText(row[textIndex]) }));
  }
  private parseQuestionCsvDeep(csv: string): any[] {
    const lines = csv.split(/\r?\n/).filter(line => line.trim()); if (!lines.length) return [];
    const split = (line: string) => { const values: string[] = []; let value = ''; let quoted = false; for (const char of line) { if (char === '"') quoted = !quoted; else if (!quoted && (char === ',' || char === ';' || char === '\t')) { values.push(value.trim()); value = ''; } else value += char; } values.push(value.trim()); return values.map(item => item.replace(/^"|"$/g, '').trim()); };
    const headers = split(lines[0]).map(value => this.normalizeImportHeader(value)); let scoreIndex = headers.findIndex(value => ['maxscore', 'score', 'mark', 'علامةالسؤال', 'العلامة'].includes(value)); let textIndex = headers.findIndex(value => ['contentar', 'question', 'text', 'نصالسؤال', 'السؤال'].includes(value)); if (scoreIndex < 0 || textIndex < 0) { scoreIndex = 0; textIndex = 1; }
    return lines.slice(1).map(line => { const values = split(line); return { maxScore: values[scoreIndex], contentAr: values[textIndex] }; });
  }
  private async readQuestionWorkbook(buffer: ArrayBuffer): Promise<any[]> {
    const ExcelJS = await import('exceljs'); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0]; const headers: string[] = []; sheet.getRow(1).eachCell((cell, index) => headers[index] = this.normalizeImportHeader(this.importCellText(cell.value)));
    let scoreIndex = headers.findIndex(value => ['علامةالسؤال', 'العلامة', 'maxscore', 'score', 'mark'].includes(value));
    let textIndex = headers.findIndex(value => ['نصالسؤال', 'السؤال', 'contentar', 'question', 'text'].includes(value));
    if (scoreIndex < 0 && textIndex < 0 && headers.length >= 2) { scoreIndex = 0; textIndex = 1; }
    if (scoreIndex < 0 || textIndex < 0) throw new Error('INVALID_HEADERS');
    const rows: any[] = []; sheet.eachRow((row, index) => { if (index > 1) rows.push({ maxScore: this.importCellText(row.getCell(scoreIndex + 1).value), contentAr: this.importCellText(row.getCell(textIndex + 1).value) }); }); return rows;
  }
  private parseQuestionCsv(csv: string): any[] {
    const lines = csv.split(/\r?\n/).filter(line => line.trim()); if (!lines.length) return [];
    const split = (line: string) => line.split(/[,;\t]/).map(value => value.trim().replace(/^"|"$/g, ''));
    const headers = split(lines[0]).map(value => this.normalizeImportHeader(value)); let scoreIndex = headers.findIndex(value => ['علامةالسؤال', 'العلامة', 'maxscore', 'score', 'mark'].includes(value)); let textIndex = headers.findIndex(value => ['نصالسؤال', 'السؤال', 'contentar', 'question', 'text'].includes(value)); if (scoreIndex < 0 && textIndex < 0 && headers.length >= 2) { scoreIndex = 0; textIndex = 1; } if (scoreIndex < 0 || textIndex < 0) throw new Error('INVALID_HEADERS');
    return lines.slice(1).map(line => { const values = split(line); return { maxScore: values[scoreIndex], contentAr: values[textIndex] }; });
  }
  private normalizeImportHeader(value: string): string { return String(value || '').replace(/^\uFEFF/, '').replace(/[\s_\-]+/g, '').trim().toLocaleLowerCase('ar'); }
  private importCellText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map((item: any) => item.text || '').join('');
    if (typeof value === 'object' && 'result' in value) return this.importCellText(value.result);
    return String(value).replace(/^\uFEFF/, '').trim();
  }
  private toImportNumber(value: any): number {
    const text = this.importCellText(value).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(',', '.');
    return Number(text);
  }

  async openResults(exam: ExamItem): Promise<void> {
    this.selectedExam.set(exam);
    this.resultSearch.set('');
    this.isLoadingResults.set(true);
    const [data, questions] = await Promise.all([this.apiService.loadExamResults(exam.id), this.state.loadExamQuestions(exam.id)]);
    this.results.set(data?.results || []);
    this.resultQuestions.set(data?.questions || questions || []);
    this.resultsWarning.set(data?.warning || '');
    this.isLoadingResults.set(false);
    this.showResultsPanel.set(true);
  }
  async refreshImportedResults(): Promise<void> { const exam = this.selectedExam(); if (exam) await this.openResults(exam); }
  resultValue(row: any, event: Event): void { const value = (event.target as HTMLInputElement).value; row.totalScore = value === '' ? null : Number(value); }
  toggleAbsence(row: any, event: Event): void { row.isAbsence = (event.target as HTMLInputElement).checked; if (row.isAbsence) row.totalScore = null; }
  async saveResults(): Promise<void> {
    const exam = this.selectedExam();
    if (!exam || this.isSavingResults()) return;
    this.isSavingResults.set(true);
    const ok = await this.apiService.saveExamResults(exam.id, this.results());
    this.isSavingResults.set(false);
    if (ok) { await this.refresh(); this.notify('success', 'تم حفظ النتائج.'); }
    else this.notify('error', 'تعذر حفظ النتائج.');
  }
  async saveResultsFromDialog(rows: any[]): Promise<void> { this.results.set(rows); await this.saveResults(); }
  async togglePublish(exam: ExamItem): Promise<void> {
    if (exam.isPublished) {
      const ok = await this.apiService.updateExam(exam.id, { isPublished: false });
      if (ok) { await this.refresh(); this.notify('success', 'تم إلغاء نشر الامتحان.'); }
      return;
    }
    if (!this.isFullyRecorded(exam) && !await this.confirmDialog.confirm({ title: 'نشر الامتحان', message: 'لم يتم رصد النتائج لكل الطلاب المتوقعين. هل تريد نشر الامتحان؟', variant: 'default' })) return;
    const ok = await this.apiService.updateExam(exam.id, { isPublished: true });
    if (ok) { await this.refresh(); this.notify('success', 'تم نشر الامتحان.'); }
    else this.notify('error', 'تعذر نشر الامتحان.');
  }

  hasGroups(exam: ExamItem): boolean { return Number(exam._count?.examGroups || 0) > 0; }
  expectedStudents(exam: ExamItem): number { return exam.metrics?.expectedStudents || 0; }
  recordedStudents(exam: ExamItem): number { return exam.metrics?.recordedStudents || 0; }
  isFullyRecorded(exam: ExamItem): boolean { const expected = this.expectedStudents(exam); return expected > 0 && this.recordedStudents(exam) >= expected; }
  isQuestionScoreMismatch(exam: ExamItem): boolean { return this.questionScoreTotal() !== Number(exam.maxScore); }
  groupGradeLabel(group: any): string { return group.classRoom?.gradeLevel?.nameAr || 'بدون طبقة محددة'; }
  private notify(type: 'success' | 'error', message: string): void { this.toast.set({ type, message }); setTimeout(() => this.toast.set(null), 3500); }
}
