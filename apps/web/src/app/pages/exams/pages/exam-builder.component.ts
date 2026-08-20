import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, ExamItem } from '../../../core/services/api.service';
import { ExamsStateService } from '../services/exams-state.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';

@Component({
  selector: 'app-exam-builder',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink],
  templateUrl: './exam-builder.component.html',
  styleUrl: './exam-builder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamBuilderComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly confirmDialog = inject(ConfirmDialogService);
  private readonly state = inject(ExamsStateService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly examId = signal('');
  readonly exam = signal<ExamItem | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly toast = signal('');
  readonly groups = signal<any[]>([]);
  readonly selectedGroupIds = signal<string[]>([]);
  readonly formSubjectId = signal('');
  readonly topics = signal<any[]>([]);
  readonly skills = signal<any[]>([]);
  readonly questionContextWarning = signal('');
  readonly questionsVersion = signal(0);
  readonly hasChanges = signal(false);
  readonly activePanel = signal<'details' | 'groups' | 'questions'>('details');
  readonly questionSearch = signal('');
  readonly importingQuestions = signal(false);
  private hydrating = true;

  // Keep the questions array inside the root form. The template uses
  // formArrayName="questions", so a detached FormArray makes Angular fail
  // to resolve every question control at runtime.
  readonly questions = this.fb.array([]) as FormArray;

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
    questions: this.questions,
  });

  readonly isEditMode = computed(() => Boolean(this.examId()));
  readonly currentYear = computed(() => this.api.academicYears().find((item: any) => item.id === this.api.selectedAcademicYearId()) || null);
  readonly availableGroups = computed(() => this.groups().filter(group =>
    group.subjectId === this.formSubjectId() &&
    group.academicYearId === (this.exam()?.academicYearId || this.api.selectedAcademicYearId()),
  ));
  readonly totalScore = computed(() => { this.questionsVersion(); return this.questions.controls.reduce((sum, control) => sum + Number(control.get('maxScore')?.value || 0), 0); });
  readonly summary = computed(() => ({
    version: this.questionsVersion(),
    questions: this.questions.length,
    totalScore: this.totalScore(),
    skills: new Set(this.questions.controls.map(control => control.get('skillId')?.value).filter(Boolean)).size,
    topics: new Set(this.questions.controls.map(control => control.get('topicId')?.value).filter(Boolean)).size,
  }));
  readonly scoreMismatch = computed(() => this.questions.length > 0 && this.totalScore() > Number(this.form.controls.maxScore.value || 0) + 0.01);
  readonly invalidQuestionCount = computed(() => { this.questionsVersion(); return this.invalidQuestionControls().length; });
  readonly selectedGroups = computed(() => this.availableGroups().filter(group => this.selectedGroupIds().includes(group.id)));
  readonly filteredQuestionCount = computed(() => {
    this.questionsVersion();
    const query = this.questionSearch().trim().toLowerCase();
    if (!query) return this.questions.length;
    return this.questions.controls.filter(control => `${control.get('contentAr')?.value || ''} ${control.get('questionNumber')?.value || ''}`.toLowerCase().includes(query)).length;
  });

  async ngOnInit(): Promise<void> {
    this.form.controls.subjectId.valueChanges.subscribe(value => { this.formSubjectId.set(value); this.refreshQuestionLookups(value); if (!this.hydrating) this.hasChanges.set(true); });
    this.form.valueChanges.subscribe(() => { if (!this.hydrating) this.hasChanges.set(true); });
    try {
      await Promise.all([
        this.state.loadExams(), this.api.loadExamTypes(), this.api.loadQuestionTypes(),
        this.api.loadAcademicPeriods(), this.api.loadSubjects(), this.api.loadTopics(), this.api.loadSkills(), this.state.loadStudyGroups(),
      ]);
      this.groups.set(this.state.studyGroups());
      this.refreshQuestionLookups(this.form.controls.subjectId.value);
      const id = this.route.snapshot.paramMap.get('examId');
      if (id && id !== 'new') {
        this.examId.set(id);
        const stateExam = typeof history !== 'undefined' && history.state?.exam ? history.state.exam as ExamItem : null;
        const current = await this.api.loadExam(id) || this.state.exams().find(item => item.id === id) || (stateExam?.id === id ? stateExam : null);
        if (!current) throw new Error('EXAM_NOT_FOUND');
        this.exam.set(current);
        this.formSubjectId.set(current.subjectId);
        this.form.reset({ titleAr: current.titleAr, titleHe: current.titleHe || '', academicPeriodId: current.academicPeriodId, subjectId: current.subjectId, examTypeId: current.examTypeId, examDate: String(current.examDate).slice(0, 10), maxScore: Number(current.maxScore), weight: current.weight == null ? null : Number(current.weight), isPublished: current.isPublished, notes: current.notes || '' });
        this.selectedGroupIds.set((await this.state.loadExamStudyGroups(id)).map((item: any) => item.studyGroupId));
        await this.loadQuestions(id);
      } else {
        this.form.reset({ titleAr: '', titleHe: '', academicPeriodId: this.api.academicPeriods()[0]?.id || '', subjectId: this.api.subjects()[0]?.id || '', examTypeId: this.api.examTypes()[0]?.id || '', examDate: new Date().toISOString().slice(0, 10), maxScore: 100, weight: null, isPublished: false, notes: '' });
        this.formSubjectId.set(this.form.controls.subjectId.value);
      }
    } catch (cause) {
      this.error.set(cause instanceof Error && cause.message === 'EXAM_NOT_FOUND' ? 'الامتحان المطلوب غير موجود.' : 'تعذر تحميل بيانات منشئ الامتحان.');
    } finally { this.hydrating = false; this.form.markAsPristine(); this.loading.set(false); }
  }

  async loadQuestions(id: string): Promise<void> {
    const context = await this.api.loadExamQuestionContext(id);
    this.topics.set(context?.topics || []); this.skills.set(context?.skills || []); this.questionContextWarning.set(context?.warning || '');
    const rows = await this.state.loadExamQuestions(id);
    if (this.api.questionLoadError()) this.questionContextWarning.set(this.api.questionLoadError());
    const questionRows = Array.isArray(rows) ? rows : (Array.isArray((rows as any)?.questions) ? (rows as any).questions : []);
    (questionRows || []).forEach((row: any) => this.addQuestion(row));
  }

  private refreshQuestionLookups(subjectId: string): void {
    if (!subjectId) return;
    const yearId = this.exam()?.academicYearId || this.api.selectedAcademicYearId();
    this.topics.set(this.api.topics().filter((item: any) => item.subjectId === subjectId && (!yearId || item.academicYearId === yearId)));
    this.skills.set(this.api.skills().filter((item: any) => item.subjectId === subjectId && (!yearId || item.academicYearId === yearId)));
  }

  questionGroup(row: any = {}): any {
    return this.fb.group({
      // رقم السؤال ترتيب داخلي ويُعاد توليده تلقائيًا، لذلك لا يجوز أن يمنع الحفظ.
      questionNumber: [Number(row.questionNumber || this.questions.length + 1)],
      questionTypeId: [row.questionTypeId || this.api.questionTypes()[0]?.id || ''],
      // الموضوع والمهارة اختياريان حسب قواعد الامتحان الحالية.
      topicId: this.fb.control<string>(row.topicId || ''),
      skillId: this.fb.control<string>(row.skillId || ''),
      maxScore: [Number(row.maxScore || 1)],
      contentAr: [row.contentAr || ''],
      contentHe: [row.contentHe || ''],
    });
  }

  addQuestion(row: any = {}): void { const control = this.questionGroup(row); this.questions.push(control); this.watchQuestion(control); this.questionsVersion.update(value => value + 1); if (!this.hydrating) this.hasChanges.set(true); }
  removeQuestion(index: number): void { this.questions.removeAt(index); this.questions.controls.forEach((control, i) => control.get('questionNumber')?.setValue(i + 1, { emitEvent: false })); this.questionsVersion.update(value => value + 1); this.hasChanges.set(true); }
  duplicateQuestion(index: number): void { const source = this.questions.at(index)?.getRawValue(); if (!source) return; this.addQuestion({ ...source, questionNumber: this.questions.length + 1 }); }
  moveQuestion(index: number, direction: -1 | 1): void { const target = index + direction; if (target < 0 || target >= this.questions.length) return; const current = this.questions.at(index); this.questions.removeAt(index, { emitEvent: false }); this.questions.insert(target, current, { emitEvent: false }); this.questions.controls.forEach((control, i) => control.get('questionNumber')?.setValue(i + 1, { emitEvent: false })); this.questionsVersion.update(value => value + 1); this.hasChanges.set(true); }
  private watchQuestion(control: any): void { control.valueChanges.subscribe(() => { this.refreshQuestionValidity(control); this.questionsVersion.update(value => value + 1); if (!this.hydrating) this.hasChanges.set(true); }); }
  private refreshQuestionValidity(control: any): void {
    const valid = Boolean(String(control.get('questionTypeId')?.value || '').trim()) && Number.isFinite(Number(control.get('maxScore')?.value)) && Number(control.get('maxScore')?.value) > 0;
    control.setErrors(valid ? null : { questionData: true }, { emitEvent: false });
  }
  private normalizeQuestionData(): void {
    this.questions.controls.forEach((control, index) => {
      const number = Number(control.get('questionNumber')?.value);
      const score = Number(control.get('maxScore')?.value);
      const typeId = String(control.get('questionTypeId')?.value || '');
      const content = String(control.get('contentAr')?.value || '').trim();
      if (!Number.isFinite(number) || number < 1) control.get('questionNumber')?.setValue(index + 1, { emitEvent: false });
      if (!Number.isFinite(score) || score <= 0) control.get('maxScore')?.setValue(1, { emitEvent: false });
      if (!typeId && this.api.questionTypes()[0]?.id) control.get('questionTypeId')?.setValue(this.api.questionTypes()[0].id, { emitEvent: false });
      if (content !== control.get('contentAr')?.value) control.get('contentAr')?.setValue(content, { emitEvent: false });
      this.refreshQuestionValidity(control);
    });
    this.questions.updateValueAndValidity({ emitEvent: false });
  }
  questionErrorMessage(control: any): string {
    const typeId = String(control.get('questionTypeId')?.value || '').trim();
    const score = Number(control.get('maxScore')?.value);
    if (!typeId) return 'اختر نوع السؤال.';
    if (!Number.isFinite(score) || score <= 0) return 'يجب أن تكون درجة السؤال أكبر من صفر.';
    return 'تحقق من بيانات السؤال.';
  }
  private invalidQuestionControls(): any[] {
    return this.questions.controls.filter(control => {
      const typeId = String(control.get('questionTypeId')?.value || '').trim();
      const score = Number(control.get('maxScore')?.value);
      return !typeId || !Number.isFinite(score) || score <= 0;
    });
  }
  private questionPayload(): any[] {
    return this.questions.getRawValue().map((row: any, index: number) => ({
      ...row,
      questionNumber: index + 1,
      topicId: row.topicId || null,
      skillId: row.skillId || null,
      contentAr: String(row.contentAr || '').trim() || null,
    }));
  }
  toggleGroup(id: string, event: Event): void { const checked = (event.target as HTMLInputElement).checked; this.selectedGroupIds.update(ids => checked ? [...new Set([...ids, id])] : ids.filter(item => item !== id)); this.hasChanges.set(true); }
  setPanel(panel: 'details' | 'groups' | 'questions'): void { this.activePanel.set(panel); }
  setQuestionSearch(event: Event): void { this.questionSearch.set((event.target as HTMLInputElement).value); }
  questionVisible(index: number): boolean {
    const query = this.questionSearch().trim().toLowerCase();
    if (!query) return true;
    const control = this.questions.at(index);
    return `${control.get('contentAr')?.value || ''} ${control.get('questionNumber')?.value || ''}`.toLowerCase().includes(query);
  }

  async downloadQuestionTemplate(): Promise<void> {
    const questionTypes = this.api.questionTypes();
    if (!questionTypes.length) {
      this.error.set('لا توجد أنواع أسئلة متاحة. أضف نوع سؤال من الإعدادات ثم حاول مرة أخرى.');
      return;
    }

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('أسئلة الامتحان', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'content', key: 'content', width: 42 },
      { header: 'questionType', key: 'questionType', width: 28 },
      { header: 'topic', key: 'topic', width: 28 },
      { header: 'skillI', key: 'skillI', width: 28 },
      { header: 'maxScore', key: 'maxScore', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF175CD3' } };
    sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.autoFilter = 'A1:E1';
    sheet.getCell('B2').value = questionTypes[0].nameAr || questionTypes[0].id;
    sheet.getCell('E2').value = 1;
    sheet.getCell('E2').numFmt = '0.##';
    sheet.getRow(2).font = { color: { argb: 'FF64748B' }, italic: true };
    sheet.getCell('A2').note = 'اختياري: اكتب نص السؤال بالعربية.';
    sheet.getCell('B2').note = 'اختر نوع السؤال من القائمة.';
    sheet.getCell('C2').note = 'اختياري: اختر الموضوع من القائمة.';
    sheet.getCell('D2').note = 'اختياري: اختر المهارة من القائمة.';
    sheet.getCell('E2').note = 'الدرجة يجب أن تكون رقمًا أكبر من صفر حسب قواعد الحفظ الحالية.';

    const listsSheet = workbook.addWorksheet('Question Lists v2');
    listsSheet.getColumn(1).width = 36; listsSheet.getColumn(2).width = 36; listsSheet.getColumn(3).width = 36;
    questionTypes.forEach((type, index) => { listsSheet.getCell(index + 1, 1).value = type.nameAr || type.id; });
    this.topics().forEach((topic, index) => { listsSheet.getCell(index + 1, 2).value = topic.nameAr || topic.id; });
    this.skills().forEach((skill, index) => { listsSheet.getCell(index + 1, 3).value = skill.nameAr || skill.id; });
    listsSheet.state = 'veryHidden';
    const typeRange = `'Question Lists v2'!$A$1:$A$${questionTypes.length}`;
    const topicRange = `'Question Lists v2'!$B$1:$B$${this.topics().length}`;
    const skillRange = `'Question Lists v2'!$C$1:$C$${this.skills().length}`;
    for (let row = 2; row <= 500; row += 1) {
      sheet.getCell(row, 2).dataValidation = { type: 'list', allowBlank: false, formulae: [typeRange] };
      if (this.topics().length) sheet.getCell(row, 3).dataValidation = { type: 'list', allowBlank: true, formulae: [topicRange] };
      if (this.skills().length) sheet.getCell(row, 4).dataValidation = { type: 'list', allowBlank: true, formulae: [skillRange] };
      sheet.getCell(row, 5).dataValidation = { type: 'decimal', allowBlank: false, operator: 'greaterThan', formulae: [0] };
      sheet.getCell(row, 5).numFmt = '0.##';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `قالب-استيراد-أسئلة-${this.exam()?.titleAr || 'امتحان'}-v2.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    this.toast.set('تم تنزيل قالب الاستيراد. نوع السؤال والدرجة مطلوبان، وباقي الحقول اختيارية.');
  }

  openQuestionImport(): void {
    (document.getElementById('question-import-file') as HTMLInputElement | null)?.click();
  }

  async importQuestions(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.importingQuestions()) return;

    this.importingQuestions.set(true);
    this.error.set('');
    try {
      if (!/\.xlsx$/i.test(file.name)) {
        throw new Error('استخدم ملف Excel بصيغة XLSX صادرًا من قالب الاستيراد.');
      }
      const buffer = await file.arrayBuffer();
      const rows = await this.readQuestionRows(buffer);
      const imported: any[] = [];
      const rejected: string[] = [];
      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        if (!row.questionType && !row.maxScore && !row.content) return;
        const questionTypeId = this.resolveQuestionType(row.questionType);
        const topicId = this.resolveLookup(row.topic, this.topics());
        const skillId = this.resolveLookup(row.skillI, this.skills());
        const maxScore = this.toImportNumber(row.maxScore);
        if (!questionTypeId) rejected.push(`الصف ${rowNumber}: نوع السؤال غير موجود.`);
        else if (row.topic && !topicId) rejected.push(`الصف ${rowNumber}: الموضوع غير موجود.`);
        else if (row.skillI && !skillId) rejected.push(`الصف ${rowNumber}: المهارة غير موجودة.`);
        else if (!Number.isFinite(maxScore) || maxScore <= 0) rejected.push(`الصف ${rowNumber}: الدرجة يجب أن تكون أكبر من صفر.`);
        else imported.push({ questionTypeId, topicId, skillId, maxScore, contentAr: this.importCellText(row.content), contentHe: '' });
      });

      if (!imported.length) {
        throw new Error(rejected.length ? rejected.slice(0, 3).join(' ') : 'لم يتم العثور على صفوف أسئلة صالحة في الملف.');
      }
      if (this.questions.length && !await this.confirmDialog.confirm({ title: 'استبدال الأسئلة', message: 'سيستبدل الاستيراد الأسئلة الحالية غير المحفوظة. هل تريد المتابعة؟', variant: 'warning' })) return;

      this.questions.clear({ emitEvent: false });
      imported.forEach(row => this.addQuestion(row));
      this.hasChanges.set(true);
      this.toast.set(`تم استيراد ${imported.length} سؤال بنجاح.`);
      if (rejected.length) this.error.set(`تم استيراد ${imported.length} سؤالًا، وتجاهل ${rejected.length} صف. ${rejected.slice(0, 2).join(' ')}`);
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : 'تعذر قراءة ملف الاستيراد.');
    } finally {
      this.importingQuestions.set(false);
    }
  }

  private async readQuestionRows(buffer: ArrayBuffer): Promise<any[]> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('ملف Excel لا يحتوي على ورقة عمل.');

    const rows: any[][] = [];
    sheet.eachRow(row => {
      const values: any[] = [];
      for (let index = 1; index <= Math.max(2, sheet.columnCount); index += 1) values.push(row.getCell(index).value);
      rows.push(values);
    });
    const headerRow = rows.findIndex(row => {
      const headers = row.map(value => this.normalizeImportHeader(this.importCellText(value)));
      return headers.some(value => ['questiontype', 'type', 'نوعالسؤال'].includes(value)) && headers.some(value => ['maxscore', 'score', 'mark', 'points', 'الدرجة', 'درجالسؤال'].includes(value));
    });
    if (headerRow < 0) throw new Error('عناوين الأعمدة غير صحيحة. استخدم قالب الاستيراد كما هو.');

    const headers = rows[headerRow].map(value => this.normalizeImportHeader(this.importCellText(value)));
    const typeIndex = headers.findIndex(value => ['questiontype', 'type', 'نوعالسؤال'].includes(value));
    const scoreIndex = headers.findIndex(value => ['maxscore', 'score', 'mark', 'points', 'الدرجة', 'درجالسؤال'].includes(value));
    const contentIndex = headers.findIndex(value => ['content', 'contentar', 'question', 'text', 'نصالسؤال', 'السؤال'].includes(value));
    const topicIndex = headers.findIndex(value => ['topic', 'topicid', 'الموضوع'].includes(value));
    const skillIndex = headers.findIndex(value => ['skilli', 'skill', 'skillid', 'المهارة'].includes(value));
    return rows.slice(headerRow + 1).map(row => ({
      questionType: this.importCellText(row[typeIndex]),
      maxScore: this.importCellText(row[scoreIndex]),
      content: contentIndex >= 0 ? this.importCellText(row[contentIndex]) : '',
      topic: topicIndex >= 0 ? this.importCellText(row[topicIndex]) : '',
      skillI: skillIndex >= 0 ? this.importCellText(row[skillIndex]) : '',
    }));
  }

  private resolveQuestionType(value: unknown): string {
    const key = this.normalizeImportValue(value);
    const match = this.api.questionTypes().find(type => [type.id, type.code, type.nameAr, type.nameHe]
      .some(candidate => this.normalizeImportValue(candidate) === key));
    return match?.id || '';
  }

  private resolveLookup(value: unknown, items: any[]): string {
    const key = this.normalizeImportValue(value);
    if (!key) return '';
    const match = items.find(item => [item.id, item.code, item.nameAr, item.nameHe]
      .some(candidate => this.normalizeImportValue(candidate) === key));
    return match?.id || '';
  }

  private normalizeImportHeader(value: string): string {
    return this.normalizeImportValue(value).replace(/[ _-]/g, '');
  }

  private normalizeImportValue(value: unknown): string {
    return this.importCellText(value).toLocaleLowerCase('ar').trim().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  }

  private importCellText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && value && 'result' in value) return this.importCellText((value as any).result);
    if (typeof value === 'object' && value && 'text' in value) return this.importCellText((value as any).text);
    return String(value).trim();
  }

  private toImportNumber(value: unknown): number {
    const text = this.importCellText(value).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(',', '.');
    return Number(text);
  }

  toggleAllGroups(): void {
    const ids = this.availableGroups().map(group => group.id);
    const allSelected = ids.length > 0 && ids.every(id => this.selectedGroupIds().includes(id));
    this.selectedGroupIds.set(allSelected ? this.selectedGroupIds().filter(id => !ids.includes(id)) : [...new Set([...this.selectedGroupIds(), ...ids])]);
    this.hasChanges.set(true);
  }
  async back(): Promise<void> { if (this.hasChanges() && !this.saving() && !await this.confirmDialog.confirm({ title: 'مغادرة منشئ الامتحان', message: 'لديك تعديلات غير محفوظة. هل تريد مغادرة الصفحة؟', variant: 'default' })) return; void this.router.navigate(['/exams']); }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) { this.form.markAllAsTouched(); return; }
    this.normalizeQuestionData();
    if (!this.selectedGroupIds().length) { this.error.set('يجب ربط مجموعة تعليمية واحدة على الأقل قبل حفظ الامتحان.'); return; }
    if (!this.questions.length) { this.error.set('أضف سؤالًا واحدًا على الأقل قبل حفظ الامتحان.'); return; }
    const invalidQuestions = this.invalidQuestionControls();
    if (invalidQuestions.length) { invalidQuestions.forEach(control => control.markAllAsTouched()); this.error.set(`يوجد ${invalidQuestions.length} سؤال يحتاج إلى استكمال البيانات.`); return; }
    if (this.scoreMismatch()) { this.error.set(`مجموع درجات الأسئلة (${this.totalScore()}) أكبر من الدرجة القصوى للامتحان (${this.form.controls.maxScore.value}). خفّض درجات الأسئلة قبل الحفظ.`); return; }
    this.saving.set(true); this.error.set('');
    try {
      const id = this.examId();
      if (!id) throw new Error('SAVE_FAILED');
      const saved = await this.api.saveExamBuilder(id, { ...this.form.getRawValue(), studyGroupIds: this.selectedGroupIds(), questions: this.questionPayload() });
      if (!saved?.id) throw new Error(this.api.questionSaveError() || 'DETAILS_FAILED');
      this.toast.set('تم حفظ الامتحان والأسئلة بنجاح.');
      this.hasChanges.set(false);
      setTimeout(() => this.router.navigate(['/exams']), 650);
    } catch (cause) { console.error('Failed to save exam builder', cause); this.error.set(cause instanceof Error && cause.message !== 'DETAILS_FAILED' ? cause.message : 'تعذر حفظ الامتحان. راجع البيانات وحاول مرة أخرى.'); }
    finally { this.saving.set(false); }
  }
}
