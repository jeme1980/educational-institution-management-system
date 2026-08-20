import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AnalysisStatCardComponent } from '../components/analysis-stat-card.component';
import {
  AnalysisTab, DEFAULT_PERFORMANCE_LEVELS, ExamAnalysisDataset, PerformanceLevel,
  QuestionAnalysis, StudentAnalysis,
} from '../models/exam-analysis.model';
import { ExamAnalysisCalculatorService } from '../services/exam-analysis-calculator.service';
import { sanitizeWorkbookTextCells } from '../../../core/utils/spreadsheet-security';
import { ExamAnalysisDataService } from '../services/exam-analysis-data.service';

@Component({
  selector: 'app-exam-analysis',
  imports: [CommonModule, FormsModule, MatIconModule, AnalysisStatCardComponent],
  templateUrl: './exam-analysis.component.html',
  styleUrl: './exam-analysis.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamAnalysisComponent implements OnInit {
  api = inject(ApiService);
  private dataService = inject(ExamAnalysisDataService);
  private calculator = inject(ExamAnalysisCalculatorService);
  private route = inject(ActivatedRoute);
  private readonly routeExamId = signal(this.route.snapshot.paramMap.get('examId') || '');

  loading = signal(true);
  error = signal('');
  dataset = signal<ExamAnalysisDataset | null>(null);
  selectedExamId = signal('');
  selectedGroupId = signal('ALL');
  activeTab = signal<AnalysisTab>('overview');
  studentSearch = signal('');
  levelFilter = signal('ALL');
  studentSort = signal<'score-desc' | 'score-asc' | 'level'>('score-desc');
  levels = signal<PerformanceLevel[]>(this.loadSavedLevels());
  levelError = signal('');
  showLevelsEditor = signal(false);
  easyThreshold = signal(80);
  mediumThreshold = signal(50);
  selectedQuestion = signal<QuestionAnalysis | null>(null);
  selectedStudent = signal<StudentAnalysis | null>(null);
  readonly hasStudentRows = computed(() => (this.dataset()?.students.length ?? 0) > 0);
  readonly availableExams = computed(() => {
    const yearId = this.api.selectedAcademicYearId();
    return this.api.exams().filter(exam => !yearId || exam.academicYearId === yearId);
  });
  readonly selectedYearLabel = computed(() => {
    const yearId = this.api.selectedAcademicYearId();
    return this.api.academicYears().find(year => year.id === yearId)?.yearLabel || 'السنة الدراسية الحالية';
  });
  readonly examSubjectLabel = computed(() => this.dataset()?.exam?.subject?.nameAr || this.dataset()?.exam?.subjectNameAr || 'غير محدد');
  readonly examPeriodLabel = computed(() => this.dataset()?.exam?.academicPeriod?.nameAr || 'غير محددة');
  readonly examGroupsLabel = computed(() => {
    const groups = this.dataset()?.groups || [];
    return groups.map((group: any) => group.studyGroupName || group.nameAr || 'الشعبة').join('، ') || 'غير محددة';
  });
  private analysisYearId = '';
  private examLoadSequence = 0;
  private readonly contextWatcher = effect(() => {
    const yearId = this.api.selectedAcademicYearId();
    const exams = this.availableExams();
    if (!yearId || !this.api.exams().length) return;
    const yearChanged = this.analysisYearId !== yearId;
    // The route exam is only the initial selection. Once the user changes
    // the dropdown, the route must not overwrite that explicit choice.
    if (!yearChanged && this.selectedExamId()) return;
    const requestedExamId = yearChanged ? this.routeExamId() : '';
    const targetExamId = (requestedExamId && exams.some(exam => exam.id === requestedExamId))
      ? requestedExamId
      : exams[0]?.id || '';

    this.analysisYearId = yearId;
    this.selectedExamId.set(targetExamId);
    this.dataset.set(null);
    if (targetExamId) void this.loadExamForSelection(targetExamId);
  });

  tabs: { id: AnalysisTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'نظرة عامة', icon: 'dashboard' },
    { id: 'students', label: 'الطلاب', icon: 'groups' },
    { id: 'questions', label: 'الأسئلة', icon: 'quiz' },
    { id: 'skills', label: 'المهارات', icon: 'psychology' },
    { id: 'topics', label: 'الموضوعات', icon: 'menu_book' },
    { id: 'comparisons', label: 'المقارنات', icon: 'compare_arrows' },
    { id: 'recommendations', label: 'التوصيات', icon: 'tips_and_updates' },
    { id: 'intervention', label: 'خطة التدخل', icon: 'diversity_3' },
  ];

  filteredBaseStudents = computed(() => {
    const data = this.dataset();
    if (!data) return [];
    const groupId = this.selectedGroupId();
    return groupId === 'ALL' ? data.students : data.students.filter(student => student.groupIds?.includes(groupId) || student.groupId === groupId);
  });
  students = computed(() => {
    const data = this.dataset();
    if (!data) return [];
    return this.calculator.students(this.filteredBaseStudents(), data.questions, Number(data.exam.maxScore), this.levels());
  });
  summary = computed(() => this.calculator.summary(this.students()));
  dataQualityWarnings = computed(() => {
    const data = this.dataset();
    if (!data) return [] as string[];
    const warnings: string[] = [];
    const questionTotal = data.questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
    const examTotal = Number(data.exam.maxScore || 0);
    const notRecorded = data.students.filter(student => !student.isAbsent && student.totalScore === null).length;
    if (notRecorded) warnings.push(`يوجد ${notRecorded} طالب دون نتيجة محفوظة؛ لا يُحتسب ضمن الحضور أو الغياب حتى يتم رصد نتيجته.`);
    if (data.questions.length && Math.abs(questionTotal - examTotal) > 0.01) warnings.push(`مجموع علامات الأسئلة (${questionTotal}) لا يساوي العلامة النهائية للامتحان (${examTotal}).`);
    if (!data.questions.length) warnings.push('لا توجد أسئلة مرتبطة بهذا الامتحان، لذلك لا يمكن استخراج تحليل الطلاب والمهارات والموضوعات.');
    return warnings;
  });
  quickInsights = computed(() => {
    const questions = this.questions();
    const skills = this.skills();
    const topics = this.topics();
    const students = this.students();
    const hardestQuestion = [...questions].sort((a, b) => a.successRate - b.successRate)[0];
    const weakestSkill = [...skills].sort((a, b) => a.masteryRate - b.masteryRate)[0];
    const weakestTopic = [...topics].sort((a, b) => a.masteryRate - b.masteryRate)[0];
    const interventionCount = students.filter(student => !student.isAbsent && student.normalizedScore < 55).length;
    return [
      hardestQuestion ? { icon: 'quiz', label: 'أصعب سؤال', value: `س${hardestQuestion.questionNumber} · ${this.format(hardestQuestion.successRate)}%`, detail: 'نسبة النجاح في السؤال', tab: 'questions' as AnalysisTab } : null,
      weakestSkill ? { icon: 'psychology', label: 'أضعف مهارة', value: weakestSkill.name, detail: `${this.format(weakestSkill.masteryRate)}% إتقان`, tab: 'skills' as AnalysisTab } : null,
      weakestTopic ? { icon: 'menu_book', label: 'أضعف موضوع', value: weakestTopic.name, detail: `${this.format(weakestTopic.masteryRate)}% إتقان`, tab: 'topics' as AnalysisTab } : null,
      { icon: 'person_alert', label: 'طلاب يحتاجون تدخلًا', value: String(interventionCount), detail: 'أداء أقل من 55%', tab: 'students' as AnalysisTab },
    ].filter(Boolean) as { icon: string; label: string; value: string; detail: string; tab: AnalysisTab }[];
  });
  interventionPriorities = computed(() => this.quickInsights().slice(0, 3));
  questions = computed(() => {
    const data = this.dataset();
    return data ? this.calculator.questions(data.questions, this.filteredBaseStudents(), this.levels(), this.easyThreshold(), this.mediumThreshold()) : [];
  });
  skills = computed(() => {
    const data = this.dataset();
    return data ? this.calculator.dimensions('skill', data.questions, this.filteredBaseStudents(), this.levels()) : [];
  });
  topics = computed(() => {
    const data = this.dataset();
    return data ? this.calculator.dimensions('topic', data.questions, this.filteredBaseStudents(), this.levels()) : [];
  });
  questionTypes = computed(() => {
    const data = this.dataset();
    return data ? this.calculator.dimensions('type', data.questions, this.filteredBaseStudents(), this.levels()) : [];
  });
  levelCounts = computed(() => this.levels().map(level => ({
    ...level,
    count: this.students().filter(student => !student.isAbsent && student.level.id === level.id).length,
  })));
  visibleStudents = computed(() => {
    const term = this.studentSearch().trim().toLocaleLowerCase();
    const filter = this.levelFilter();
    const list = this.students().filter(student =>
      (!term || student.studentName.toLocaleLowerCase().includes(term) || student.studentNumber?.toLocaleLowerCase().includes(term)) &&
      (filter === 'ALL' || student.level.id === filter)
    );
    return [...list].sort((a, b) => {
      if (this.studentSort() === 'score-asc') return a.normalizedScore - b.normalizedScore;
      if (this.studentSort() === 'level') return b.level.min - a.level.min;
      return b.normalizedScore - a.normalizedScore;
    });
  });
  recommendations = computed(() => {
    const weakSkills = this.skills().filter(item => item.masteryRate < 55);
    const weakTopics = this.topics().filter(item => item.masteryRate < 55);
    const hardQuestions = this.questions().filter(item => item.difficulty === 'صعب');
    const interventionStudents = this.students().filter(item => !item.isAbsent && item.normalizedScore < 55);
    return [
      ...weakSkills.map(item => ({ icon: 'psychology', title: `إعادة تدريس مهارة: ${item.name}`, detail: `نسبة الإتقان ${this.format(item.masteryRate)}%، ويحتاج ${item.supportStudents} طالب إلى تعزيز.`, })),
      ...weakTopics.map(item => ({ icon: 'menu_book', title: `تعزيز موضوع: ${item.name}`, detail: `متوسط الأداء ${this.format(item.averagePerformance)}%. يُقترح نشاط تطبيقي قصير ثم تقويم تكويني.`, })),
      ...hardQuestions.map(item => ({ icon: 'quiz', title: `مراجعة السؤال ${item.questionNumber}`, detail: `نسبة النجاح ${this.format(item.successRate)}% ونسبة عدم الإجابة ${this.format(item.unansweredRate)}%.`, })),
      ...(interventionStudents.length ? [{ icon: 'person_alert', title: 'تدخل فردي', detail: `${interventionStudents.length} طالب دون مستوى 55% ويحتاجون خطة متابعة قصيرة المدى.` }] : []),
    ];
  });
  interventionGroups = computed(() => [
    { name: 'مجموعة الإثراء', color: '#16a34a', students: this.students().filter(student => !student.isAbsent && student.normalizedScore >= 85), duration: 'أسبوعان', activity: 'مشروع تطبيقي متقدم' },
    { name: 'مجموعة الإتقان', color: '#2563eb', students: this.students().filter(student => !student.isAbsent && student.normalizedScore >= 70 && student.normalizedScore < 85), duration: 'أسبوعان', activity: 'مهام تطبيق وممارسة موجهة' },
    { name: 'مجموعة التعزيز', color: '#f59e0b', students: this.students().filter(student => !student.isAbsent && student.normalizedScore >= 55 && student.normalizedScore < 70), duration: '3 أسابيع', activity: 'أوراق عمل علاجية وتغذية راجعة' },
    { name: 'مجموعة التدخل المكثف', color: '#dc2626', students: this.students().filter(student => !student.isAbsent && student.normalizedScore < 55), duration: '4 أسابيع', activity: 'تعليم مصغر ومتابعة فردية' },
  ]);

  async ngOnInit() {
    try {
      await this.dataService.initializeLookups();
      const requestedExamId = this.routeExamId();
      const first = this.availableExams()[0];
      const targetExamId = requestedExamId || first?.id || '';
      if (targetExamId && this.analysisYearId !== this.api.selectedAcademicYearId()) {
        this.analysisYearId = this.api.selectedAcademicYearId() || '';
        this.selectedExamId.set(targetExamId);
        await this.loadExamForSelection(targetExamId);
      }
    } catch { this.error.set('تعذر تحميل بيانات تحليل الامتحان.'); }
    finally { this.loading.set(false); }
  }


  private async loadExamForSelection(examId: string) {
    const requestSequence = ++this.examLoadSequence;
    if (!examId) { this.dataset.set(null); this.loading.set(false); return; }
    this.selectedExamId.set(examId);
    this.loading.set(true); this.error.set(''); this.selectedGroupId.set('ALL'); this.studentSearch.set(''); this.levelFilter.set('ALL'); this.selectedQuestion.set(null); this.selectedStudent.set(null);
    try {
      const nextDataset = await this.dataService.load(examId);
      if (requestSequence !== this.examLoadSequence || this.selectedExamId() !== examId) return;
      this.dataset.set(nextDataset);
    } catch {
      if (requestSequence !== this.examLoadSequence || this.selectedExamId() !== examId) return;
      this.error.set('تعذر تحميل نتائج الامتحان المحدد.'); this.dataset.set(null);
    } finally {
      if (requestSequence === this.examLoadSequence) this.loading.set(false);
    }
  }

  async loadExam() {
    if (!this.selectedExamId()) { this.dataset.set(null); return; }
    this.loading.set(true); this.error.set(''); this.selectedGroupId.set('ALL'); this.studentSearch.set(''); this.levelFilter.set('ALL'); this.selectedQuestion.set(null); this.selectedStudent.set(null);
    try { this.dataset.set(await this.dataService.load(this.selectedExamId())); }
    catch { this.error.set('تعذر تحميل نتائج الامتحان المحدد.'); this.dataset.set(null); }
    finally { this.loading.set(false); }
  }

  onExamSelectionChange(examId: string) {
    if (!examId || examId === this.selectedExamId()) return;
    void this.loadExamForSelection(examId);
  }

  updateLevel(index: number, field: keyof PerformanceLevel, value: string | number) {
    const levels = this.levels().map((level, i) => i === index ? { ...level, [field]: field === 'name' || field === 'color' ? value : Number(value) } : level);
    this.levels.set(levels); this.levelError.set(this.calculator.validateLevels(levels) || '');
  }
  addLevel() { this.levels.update(levels => [...levels, { id: crypto.randomUUID(), name: 'مستوى جديد', min: 0, max: 0, color: '#64748b' }]); }
  deleteLevel(index: number) { this.levels.update(levels => levels.filter((_, i) => i !== index)); this.levelError.set(this.calculator.validateLevels(this.levels()) || ''); }
  moveLevel(index: number, direction: number) {
    const target = index + direction; const levels = [...this.levels()];
    if (target < 0 || target >= levels.length) return;
    [levels[index], levels[target]] = [levels[target], levels[index]]; this.levels.set(levels);
  }
  saveLevels() {
    const error = this.calculator.validateLevels(this.levels()); this.levelError.set(error || '');
    if (!error) { localStorage.setItem('exam-analysis-levels', JSON.stringify(this.levels())); this.showLevelsEditor.set(false); }
  }
  resetLevels() { this.levels.set(DEFAULT_PERFORMANCE_LEVELS.map(level => ({ ...level }))); this.levelError.set(''); }
  private loadSavedLevels(): PerformanceLevel[] {
    try { return JSON.parse(localStorage.getItem('exam-analysis-levels') || '') || DEFAULT_PERFORMANCE_LEVELS.map(level => ({ ...level })); }
    catch { return DEFAULT_PERFORMANCE_LEVELS.map(level => ({ ...level })); }
  }

  format(value: number) { return Number(value || 0).toFixed(1); }
  levelPercent(count: number) { const total = this.summary().attended; return total ? count / total * 100 : 0; }
  donutGradient() {
    let cursor = 0;
    const stops = this.levelCounts().map(level => {
      const start = cursor; cursor += this.levelPercent(level.count);
      return `${level.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.length ? stops.join(',') : '#e2e8f0 0 100%'})`;
  }
  groupComparisons() {
    const data = this.dataset();
    if (!data) return [];
    const names = new Map(data.groups.map(group => [group.studyGroupId, group.studyGroupName || group.nameAr || 'الشعبة']));
    const groupIds = [...new Set(data.students.flatMap(student => student.groupIds?.length ? student.groupIds : student.groupId ? [student.groupId] : []).filter(Boolean))];
    return groupIds.map(groupId => {
      const analyzed = this.calculator.students(data.students.filter(student => student.groupIds?.includes(groupId) || student.groupId === groupId), data.questions, Number(data.exam.maxScore), this.levels());
      return { id: groupId, name: names.get(groupId) || analyzed[0]?.groupName || 'الشعبة', summary: this.calculator.summary(analyzed) };
    });
  }
  weakestSkillNames() { return this.skills().slice(-2).map(skill => skill.name).join('، ') || 'حسب التخصص الفردي'; }
  printReport() { window.print(); }
  async exportResults() {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook(); const sheet = workbook.addWorksheet('تحليل الطلاب', { views: [{ rightToLeft: true }] });
    sheet.columns = [
      { header: 'رقم الطالب', key: 'number', width: 20 }, { header: 'اسم الطالب', key: 'name', width: 30 },
      { header: 'العلامة الخام', key: 'raw', width: 16 }, { header: 'العلامة من 100', key: 'normalized', width: 18 },
      { header: 'المستوى', key: 'level', width: 20 }, { header: 'صحيح', key: 'correct', width: 12 },
      { header: 'خطأ', key: 'wrong', width: 12 }, { header: 'غير مجاب', key: 'unanswered', width: 14 },
    ];
    this.visibleStudents().forEach(student => sheet.addRow({ number: student.studentNumber, name: student.studentName, raw: student.totalScore, normalized: this.format(student.normalizedScore), level: student.isAbsent ? 'لم يمتحن' : student.level.name, correct: student.correct, wrong: student.wrong, unanswered: student.unanswered }));
    sheet.getRow(1).font = { bold: true };
    sanitizeWorkbookTextCells(workbook);
    const data = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = url; link.download = `exam-analysis-${this.dataset()?.exam.titleAr}.xlsx`; link.click(); URL.revokeObjectURL(url);
  }
}
