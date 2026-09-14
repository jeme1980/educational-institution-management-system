import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';

interface QuestionContext { topics: any[]; skills: any[]; gradeLevels: any[]; warning: string | null }
type ExamFilterName = 'subject' | 'grade' | 'class' | 'teacher' | 'period' | 'examType' | 'published';
interface ExamClassOption { id: string; nameAr: string; gradeLevelId: string; gradeLevelName: string }
interface ExamTeacherOption { id: string; nameAr: string }
export const EXAM_FILTER_ALL = 'all';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-exams',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule, ExamTableComponent, ExamResultsDialogComponent, UiButtonComponent, UiPageHeaderComponent, UiStatCardComponent, UiSelectComponent, UiInputComponent],
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
  readonly subjectFilter = signal(EXAM_FILTER_ALL);
  readonly gradeFilter = signal(EXAM_FILTER_ALL);
  readonly classFilter = signal(EXAM_FILTER_ALL);
  readonly teacherFilter = signal(EXAM_FILTER_ALL);
  readonly academicPeriodFilter = signal(EXAM_FILTER_ALL);
  readonly examTypeFilter = signal(EXAM_FILTER_ALL);
  readonly publishedFilter = signal(EXAM_FILTER_ALL);
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
  readonly classOptions = computed<ExamClassOption[]>(() => {
    const options = new Map<string, ExamClassOption>();
    for (const item of this.state.classes()) {
      options.set(item.id, {
        id: item.id,
        nameAr: item.nameAr,
        gradeLevelId: item.gradeLevelId,
        gradeLevelName: item.gradeLevelInfo?.nameAr || item.gradeLevel || '',
      });
    }
    for (const exam of this.exams()) for (const link of exam.examGroups || []) {
      const classRoom = link.studyGroup.classRoom;
      if (classRoom) options.set(classRoom.id, { id: classRoom.id, nameAr: classRoom.nameAr, gradeLevelId: classRoom.gradeLevelId, gradeLevelName: classRoom.gradeLevel?.nameAr || '' });
    }
    return [...options.values()].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
  });
  readonly gradeOptions = computed(() => {
    const options = new Map<string, { id: string; nameAr: string }>();
    for (const item of this.classOptions()) if (item.gradeLevelId) options.set(item.gradeLevelId, { id: item.gradeLevelId, nameAr: item.gradeLevelName });
    return [...options.values()].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
  });
  readonly visibleClassOptions = computed(() => this.gradeFilter() === EXAM_FILTER_ALL
    ? this.classOptions()
    : this.classOptions().filter(item => item.gradeLevelId === this.gradeFilter()));
  readonly teacherOptions = computed<ExamTeacherOption[]>(() => {
    const options = new Map<string, ExamTeacherOption>();
    for (const exam of this.exams()) for (const link of exam.examGroups || []) {
      const assignment = link.studyGroup.staffAssignment;
      const teacher = assignment?.staffMember;
      if (assignment?.staffMemberId && teacher) options.set(assignment.staffMemberId, { id: assignment.staffMemberId, nameAr: `${teacher.firstNameAr} ${teacher.familyNameAr}`.trim() });
    }
    return [...options.values()].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
  });
  readonly examTypeOptions = computed(() => {
    const options = new Map<string, { id: string; nameAr: string }>();
    for (const type of this.apiService.examTypes()) if (type.isActive !== false) options.set(type.id, { id: type.id, nameAr: type.nameAr });
    for (const exam of this.exams()) if (exam.examType) options.set(exam.examType.id, { id: exam.examType.id, nameAr: exam.examType.nameAr });
    return [...options.values()];
  });
  readonly filteredExams = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('ar');
    return this.exams().filter(exam =>
      (this.subjectFilter() === EXAM_FILTER_ALL || exam.subjectId === this.subjectFilter()) &&
      (this.gradeFilter() === EXAM_FILTER_ALL || this.matchesExamGroup(exam, group => group.classRoom?.gradeLevelId === this.gradeFilter())) &&
      (this.classFilter() === EXAM_FILTER_ALL || this.matchesExamGroup(exam, group => group.classId === this.classFilter() || group.classRoom?.id === this.classFilter())) &&
      (this.teacherFilter() === EXAM_FILTER_ALL || this.matchesExamGroup(exam, group => group.staffAssignment?.staffMemberId === this.teacherFilter())) &&
      (this.academicPeriodFilter() === EXAM_FILTER_ALL || exam.academicPeriodId === this.academicPeriodFilter()) &&
      (this.examTypeFilter() === EXAM_FILTER_ALL || exam.examTypeId === this.examTypeFilter()) &&
      (this.publishedFilter() === EXAM_FILTER_ALL || String(exam.isPublished) === this.publishedFilter()) &&
      (!query || [exam.titleAr, exam.titleHe, exam.subject?.nameAr, exam.examType?.nameAr, exam.academicPeriod?.nameAr]
        .some(value => String(value || '').toLocaleLowerCase('ar').includes(query))),
    );
  });
  readonly hasActiveFilters = computed(() => Boolean(this.search()) || [this.subjectFilter(), this.gradeFilter(), this.classFilter(), this.teacherFilter(), this.academicPeriodFilter(), this.examTypeFilter(), this.publishedFilter()].some(value => value !== EXAM_FILTER_ALL));
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
  private observedAcademicYearId = this.apiService.selectedAcademicYearId();
  private readonly academicYearEffect = effect(() => {
    const academicYearId = this.apiService.selectedAcademicYearId();
    if (academicYearId === this.observedAcademicYearId) return;
    this.observedAcademicYearId = academicYearId;
    this.resetYearScopedFilters();
    void this.refresh();
  });

  ngOnInit(): void { void this.refresh(); }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    await Promise.all([
      this.state.loadExams(),
      this.apiService.loadExamTypes(),
      this.apiService.loadQuestionTypes(),
      this.apiService.loadAcademicPeriods(),
      this.apiService.loadSubjects(),
      this.state.loadClasses(),
      this.state.loadStudyGroups(),
    ]);
    this.reconcileYearScopedFilters();
    this.isLoading.set(false);
  }

  updateResultSearch(event: Event): void { this.resultSearch.set((event.target as HTMLInputElement).value); }
  setFilter(name: ExamFilterName, value: string): void {
    if (name === 'subject') this.subjectFilter.set(value);
    if (name === 'grade') {
      this.gradeFilter.set(value);
      if (this.classFilter() !== EXAM_FILTER_ALL && !this.visibleClassOptions().some(item => item.id === this.classFilter())) this.classFilter.set(EXAM_FILTER_ALL);
    }
    if (name === 'class') this.classFilter.set(value);
    if (name === 'teacher') this.teacherFilter.set(value);
    if (name === 'period') this.academicPeriodFilter.set(value);
    if (name === 'examType') this.examTypeFilter.set(value);
    if (name === 'published') this.publishedFilter.set(value);
  }
  clearFilters(): void {
    this.search.set('');
    this.subjectFilter.set(EXAM_FILTER_ALL);
    this.gradeFilter.set(EXAM_FILTER_ALL);
    this.classFilter.set(EXAM_FILTER_ALL);
    this.teacherFilter.set(EXAM_FILTER_ALL);
    this.academicPeriodFilter.set(EXAM_FILTER_ALL);
    this.examTypeFilter.set(EXAM_FILTER_ALL);
    this.publishedFilter.set(EXAM_FILTER_ALL);
  }

  private matchesExamGroup(exam: ExamItem, predicate: (group: NonNullable<ExamItem['examGroups']>[number]['studyGroup']) => boolean): boolean {
    return (exam.examGroups || []).some(link => predicate(link.studyGroup));
  }

  private resetYearScopedFilters(): void {
    this.subjectFilter.set(EXAM_FILTER_ALL);
    this.gradeFilter.set(EXAM_FILTER_ALL);
    this.classFilter.set(EXAM_FILTER_ALL);
    this.teacherFilter.set(EXAM_FILTER_ALL);
    this.academicPeriodFilter.set(EXAM_FILTER_ALL);
  }

  private reconcileYearScopedFilters(): void {
    if (this.subjectFilter() !== EXAM_FILTER_ALL && !this.apiService.subjects().some(item => item.id === this.subjectFilter())) this.subjectFilter.set(EXAM_FILTER_ALL);
    if (this.gradeFilter() !== EXAM_FILTER_ALL && !this.gradeOptions().some(item => item.id === this.gradeFilter())) this.gradeFilter.set(EXAM_FILTER_ALL);
    if (this.classFilter() !== EXAM_FILTER_ALL && !this.visibleClassOptions().some(item => item.id === this.classFilter())) this.classFilter.set(EXAM_FILTER_ALL);
    if (this.teacherFilter() !== EXAM_FILTER_ALL && !this.teacherOptions().some(item => item.id === this.teacherFilter())) this.teacherFilter.set(EXAM_FILTER_ALL);
    if (this.academicPeriodFilter() !== EXAM_FILTER_ALL && !this.apiService.academicPeriods().some(item => item.id === this.academicPeriodFilter())) this.academicPeriodFilter.set(EXAM_FILTER_ALL);
  }

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
  private normalizeImportHeader(value: string): string { return String(value || '').replace(/^\uFEFF/, '').replace(/[\s_-]+/g, '').trim().toLocaleLowerCase('ar'); }
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
  refreshImportedResults(data: { results: any[]; questions: any[]; warning: string }): void {
    this.results.set(data.results);
    this.resultQuestions.set(data.questions);
    this.resultsWarning.set(data.warning);
  }
  resultValue(row: any, event: Event): void { const value = (event.target as HTMLInputElement).value; row.totalScore = value === '' ? null : Number(value); }
  toggleAbsence(row: any, event: Event): void { row.isAbsence = (event.target as HTMLInputElement).checked; if (row.isAbsence) row.totalScore = null; }
  async saveResults(): Promise<void> {
    await this.persistResults(this.results());
  }
  async saveResultsFromDialog(rows: any[]): Promise<void> { await this.persistResults(rows); }
  private async persistResults(rows: any[]): Promise<void> {
    const exam = this.selectedExam();
    if (!exam || this.isSavingResults() || !rows.length) return;
    this.isSavingResults.set(true);
    const payload = rows.map(row => ({
      studentId: row.studentId,
      isAbsence: Boolean(row.isAbsence),
      totalScore: row.isAbsence ? 0 : row.totalScore,
      absenceReason: row.absenceReason || null,
      notes: row.notes || null,
      questionScores: row.isAbsence ? [] : (row.questionScores || []).map((score: any) => ({
        questionId: score.questionId,
        score: score.score === '' || score.score === undefined ? null : score.score,
        notes: score.notes || null,
      })),
    }));
    const ok = await this.apiService.saveExamResults(exam.id, payload);
    if (!ok) {
      this.isSavingResults.set(false);
      const detail = this.apiService.examResultsSaveError();
      this.notify('error', detail || 'تعذر حفظ النتائج. بقيت تعديلاتك متاحة لإعادة المحاولة.');
      return;
    }
    const refreshed = await this.apiService.loadExamResults(exam.id);
    if (!refreshed) {
      this.isSavingResults.set(false);
      this.notify('error', 'تم حفظ النتائج، لكن تعذر تحديثها من الخادم. أعد المحاولة للتأكد من أحدث البيانات.');
      return;
    }
    this.results.set(refreshed.results || []);
    this.resultQuestions.set(refreshed.questions || []);
    this.resultsWarning.set(refreshed.warning || '');
    await this.refresh();
    this.isSavingResults.set(false);
    this.notify('success', 'تم حفظ النتائج بنجاح.');
  }
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
