import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { PerformanceBarChartComponent } from '../components/performance-bar-chart.component';
import { PerformanceDonutChartComponent } from '../components/performance-donut-chart.component';
import { QuestionSuccessChartComponent } from '../components/question-success-chart.component';
import { TopicOverviewChartComponent } from '../components/topic-overview-chart.component';
import { SkillOverviewChartComponent } from '../components/skill-overview-chart.component';
import {
  AnalysisQuestion, AnalysisStudent, AnalysisTab, DEFAULT_PERFORMANCE_LEVELS, DimensionAnalysis, ExamAnalysisDataset, PerformanceLevel,
  QuestionAnalysis, StudentAnalysis,
} from '../models/exam-analysis.model';
import { ExamAnalysisCalculatorService } from '../services/exam-analysis-calculator.service';
import { sanitizeWorkbookTextCells } from '../../../core/utils/spreadsheet-security';
import { ExamAnalysisDataService } from '../services/exam-analysis-data.service';

export interface InterventionGroupView {
  levelId: string;
  levelMin: number;
  levelMax: number;
  name: string;
  color: string;
  students: StudentAnalysis[];
  targetedSkills: DimensionAnalysis[];
  duration: string;
  activity: string;
  successCriterion: string;
}

export type RecommendationType = 'skill' | 'topic' | 'question' | 'individual';
export type RecommendationSeverity = 'critical' | 'high' | 'moderate';
export interface RecommendationItem {
  type: RecommendationType;
  severity: RecommendationSeverity;
  priorityValue: number | null;
  icon: string;
  title: string;
  detail: string;
  actionHint: string;
  actionTab: AnalysisTab;
  actionPayload: string | null;
}

export interface RecommendationGroup {
  severity: RecommendationSeverity;
  label: string;
  items: RecommendationItem[];
}

export function recommendationSeverity(priorityValue: number | null): RecommendationSeverity {
  if (priorityValue !== null && priorityValue < 30) return 'critical';
  if (priorityValue !== null && priorityValue < 45) return 'high';
  return 'moderate';
}

function recommendationPriority(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function groupRecommendations(items: RecommendationItem[]): RecommendationGroup[] {
  const order: RecommendationSeverity[] = ['critical', 'high', 'moderate'];
  const labels: Record<RecommendationSeverity, string> = { critical: 'حرج', high: 'مرتفع', moderate: 'متوسط' };
  return order.map(severity => ({
    severity,
    label: labels[severity],
    items: items.filter(item => item.severity === severity).sort((left, right) => {
      if (left.priorityValue === null && right.priorityValue !== null) return 1;
      if (left.priorityValue !== null && right.priorityValue === null) return -1;
      return (left.priorityValue ?? 0) - (right.priorityValue ?? 0) || left.title.localeCompare(right.title, 'ar');
    }),
  })).filter(group => group.items.length > 0);
}

export type QuestionSortKey = 'question' | 'topic' | 'skill' | 'average' | 'successRate';
export type QuestionSortDirection = 'asc' | 'desc';
export type TopicSortKey = 'mastery-desc' | 'mastery-asc' | 'questions-desc' | 'name';
export type SkillSortKey = TopicSortKey;
export type StudentSortKey = 'score-desc' | 'score-asc' | 'level';
export const ALL_ANALYSIS_CLASSES = 'ALL';

export interface ExamAnalysisClassOption { id: string; label: string }

export function examAnalysisClassOptions(groups: any[]): ExamAnalysisClassOption[] {
  const seen = new Set<string>();
  return groups.flatMap(group => {
    const id = String(group.studyGroupId || group.id || '').trim();
    if (!id || id === ALL_ANALYSIS_CLASSES || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: group.studyGroupName || group.nameAr || 'الشعبة' }];
  });
}

export function filterAnalysisStudentsByClass(students: AnalysisStudent[], selectedClassId: string): AnalysisStudent[] {
  if (selectedClassId === ALL_ANALYSIS_CLASSES) return students;
  return students.filter(student => student.groupIds?.includes(selectedClassId) || student.groupId === selectedClassId);
}

export function questionDetailUnavailable(questions: QuestionAnalysis[], attendedCount: number, hasMatchingQuestionScore: boolean): boolean {
  return questions.length > 0 && attendedCount > 0 && !hasMatchingQuestionScore && questions.every(question => question.unansweredRate === 100);
}

export function filterAndSortQuestions(questions: QuestionAnalysis[], search: string, sort: QuestionSortKey, direction: QuestionSortDirection): QuestionAnalysis[] {
  const term = search.trim().toLocaleLowerCase();
  const filtered = questions.filter(question => !term || [
    `س${question.questionNumber}`,
    String(question.questionNumber),
    question.text || '',
    question.topicName || '',
    question.skillName || '',
  ].some(value => value.trim().toLocaleLowerCase().includes(term)));
  const value = (question: QuestionAnalysis): string | number | null => {
    if (sort === 'question') return question.questionNumber;
    if (sort === 'average') return Number.isFinite(question.average) ? question.average : null;
    if (sort === 'successRate') return Number.isFinite(question.successRate) ? question.successRate : null;
    return sort === 'topic' ? question.topicName : question.skillName;
  };
  const compare = (left: QuestionAnalysis, right: QuestionAnalysis) => {
    const a = value(left); const b = value(right);
    if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? left.questionNumber - right.questionNumber : 1;
    if (b === null || b === undefined || b === '') return -1;
    const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ar');
    return result || left.questionNumber - right.questionNumber;
  };
  return [...filtered].sort((left, right) => (direction === 'asc' ? 1 : -1) * compare(left, right));
}

export function filterAndSortTopics(topics: DimensionAnalysis[], search: string, sort: TopicSortKey): DimensionAnalysis[] {
  const term = search.trim().toLocaleLowerCase();
  const filtered = topics.filter(topic => !term || topic.name.trim().toLocaleLowerCase().includes(term));
  return [...filtered].sort((left, right) => {
    if (sort === 'name') return left.name.localeCompare(right.name, 'ar') || left.id.localeCompare(right.id);
    if (sort === 'questions-desc') return right.questionCount - left.questionCount || right.masteryRate - left.masteryRate;
    if (sort === 'mastery-asc') return left.masteryRate - right.masteryRate || left.questionCount - right.questionCount;
    return right.masteryRate - left.masteryRate || right.questionCount - left.questionCount;
  });
}

export function filterAndSortSkills(skills: DimensionAnalysis[], search: string, sort: SkillSortKey): DimensionAnalysis[] {
  return filterAndSortTopics(skills, search, sort);
}

export function filterAndSortStudents(students: StudentAnalysis[], search: string, levelFilter: string, sort: StudentSortKey): StudentAnalysis[] {
  const term = search.trim().toLocaleLowerCase();
  const filtered = students.filter(student =>
    (!term || student.studentName.toLocaleLowerCase().includes(term)) &&
    (levelFilter === 'ALL' || student.level.id === levelFilter)
  );
  return [...filtered].sort((left, right) => {
    if (sort === 'score-asc') return left.normalizedScore - right.normalizedScore;
    if (sort === 'level') return right.level.min - left.level.min;
    return right.normalizedScore - left.normalizedScore;
  });
}

type InterventionPlan = Pick<InterventionGroupView, 'name' | 'color' | 'duration' | 'activity'>;
const INTERVENTION_PLANS: Record<string, InterventionPlan> = {
  high: { name: 'مجموعة الإثراء', color: '#16a34a', duration: 'أسبوعان', activity: 'مشروع تطبيقي متقدم' },
  'upper-mid': { name: 'مجموعة الإتقان', color: '#2563eb', duration: 'أسبوعان', activity: 'مهام تطبيق وممارسة موجهة' },
  'lower-mid': { name: 'مجموعة التعزيز', color: '#f59e0b', duration: '3 أسابيع', activity: 'أوراق عمل علاجية وتغذية راجعة' },
  low: { name: 'مجموعة التدخل المكثف', color: '#dc2626', duration: '4 أسابيع', activity: 'تعليم مصغر ومتابعة فردية' },
};

export function buildInterventionGroups(levels: PerformanceLevel[], students: StudentAnalysis[]): InterventionGroupView[] {
  return [...levels].sort((left, right) => left.min - right.min).map((level) => {
    const plan = INTERVENTION_PLANS[level.id];
    return {
      levelId: level.id,
      levelMin: level.min,
      levelMax: level.max,
      name: plan?.name || level.name,
      color: level.color,
      students: students.filter(student => !student.isAbsent && student.level.id === level.id),
      targetedSkills: [],
      duration: plan?.duration || 'حسب الحاجة',
      activity: plan?.activity || 'تدريب تدريجي مناسب للدرجة',
      successCriterion: '',
    };
  });
}

export function countFollowUpStudents(groups: InterventionGroupView[], topLevelId: string): number {
  return groups.filter(group => group.levelId !== topLevelId).reduce((total, group) => total + group.students.length, 0);
}

export function interventionSuccessCriterion(level: PerformanceLevel, levels: PerformanceLevel[]): string {
  const nextLevel = [...levels].filter(candidate => candidate.min > level.min).sort((left, right) => left.min - right.min)[0];
  return nextLevel ? `الوصول إلى مستوى ${nextLevel.name} أو أعلى` : `الحفاظ على مستوى ${level.name} مع توسيع مهام التحدي`;
}

export function groupTargetedSkills(
  calculator: ExamAnalysisCalculatorService,
  questions: AnalysisQuestion[],
  students: StudentAnalysis[],
  levels: PerformanceLevel[],
): DimensionAnalysis[] {
  return calculator.dimensions('skill', questions, students, levels)
    .filter(skill => skill.name !== 'غير مصنف')
    .sort((left, right) => left.masteryRate - right.masteryRate || left.name.localeCompare(right.name, 'ar'));
}

@Component({
  selector: 'app-exam-analysis',
  imports: [CommonModule, FormsModule, MatIconModule, PerformanceBarChartComponent, PerformanceDonutChartComponent, QuestionSuccessChartComponent, SkillOverviewChartComponent, TopicOverviewChartComponent, UiButtonComponent, UiFilterPanelComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent, UiStatCardComponent, UiTableActionsComponent],
  templateUrl: './exam-analysis.component.html',
  styleUrl: './exam-analysis.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamAnalysisComponent implements OnInit {
  api = inject(ApiService);
  private dataService = inject(ExamAnalysisDataService);
  private calculator = inject(ExamAnalysisCalculatorService);
  private route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeExamId = signal(this.route.snapshot.paramMap.get('examId') || '');

  loading = signal(true);
  error = signal('');
  dataset = signal<ExamAnalysisDataset | null>(null);
  selectedExamId = signal('');
  selectedGroupId = signal(ALL_ANALYSIS_CLASSES);
  activeTab = signal<AnalysisTab>('overview');
  studentSearch = signal('');
  levelFilter = signal('ALL');
  studentSort = signal<StudentSortKey>('score-desc');
  levels = signal<PerformanceLevel[]>(this.loadSavedLevels());
  levelError = signal('');
  showLevelsEditor = signal(false);
  easyThreshold = signal(80);
  mediumThreshold = signal(50);
  selectedQuestion = signal<QuestionAnalysis | null>(null);
  selectedStudent = signal<StudentAnalysis | null>(null);
  questionSearch = signal('');
  questionSort = signal<QuestionSortKey>('question');
  questionSortDirection = signal<QuestionSortDirection>('asc');
  topicSearch = signal('');
  topicSort = signal<TopicSortKey>('mastery-desc');
  selectedTopicId = signal('');
  skillSearch = signal('');
  skillSort = signal<SkillSortKey>('mastery-desc');
  selectedSkillId = signal('');
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
  readonly classOptions = computed(() => examAnalysisClassOptions(this.dataset()?.groups || []));
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
    return filterAnalysisStudentsByClass(data.students, groupId);
  });
  questionMaxTotal = computed(() => {
    const data = this.dataset();
    if (!data) return 0;
    return Number(data.backendAnalysis?.normalization?.possibleScore ?? data.questions.reduce((sum, question) => sum + Number(question.points || 0), 0));
  });
  analysisAvailable = computed(() => this.questionMaxTotal() > 0);
  normalizationInfo = computed(() => {
    const possibleScore = this.questionMaxTotal();
    if (possibleScore <= 0 || Math.abs(possibleScore - 100) <= 0.01) return '';
    return `مجموع درجات الأسئلة هو ${this.format(possibleScore)}، ويتم تحويل النتائج في التحليل تلقائيًا إلى مقياس 100.`;
  });
  students = computed(() => {
    const data = this.dataset();
    if (!data) return [];
    return this.calculator.students(this.filteredBaseStudents(), data.questions, this.questionMaxTotal(), this.levels());
  });
  summary = computed(() => {
    const calculated = this.calculator.summary(this.students());
    const backend = this.dataset()?.backendAnalysis?.summary;
    return this.selectedGroupId() === 'ALL' && backend ? { ...calculated, ...backend } : calculated;
  });
  dataQualityWarnings = computed(() => {
    const data = this.dataset();
    if (!data) return [] as string[];
    const warnings: string[] = [];
    const questionTotal = this.questionMaxTotal();
    const notRecorded = data.students.filter(student => !student.isAbsent && student.totalScore === null).length;
    if (notRecorded) warnings.push(`يوجد ${notRecorded} طالب دون نتيجة محفوظة؛ لا يُحتسب ضمن الحضور أو الغياب حتى يتم رصد نتيجته.`);
    if (data.questions.some(question => Number(question.points) <= 0)) warnings.push('يوجد سؤال بدرجة قصوى غير صالحة؛ راجع إعداد درجات الأسئلة.');
    if (questionTotal > 0 && data.students.some(student => !student.isAbsent && student.totalScore !== null && Number(student.totalScore) > questionTotal)) warnings.push(`توجد نتيجة خام تتجاوز مجموع درجات الأسئلة (${this.format(questionTotal)})؛ راجع بيانات الرصد.`);
    if (!data.questions.length) warnings.push('لا توجد أسئلة مرتبطة بهذا الامتحان، لذلك لا يمكن استخراج تحليل الطلاب والمهارات والموضوعات.');
    return warnings;
  });
  quickInsights = computed(() => {
    const questions = this.questions();
    const skills = this.skills();
    const topics = this.topics();
    const students = this.students();
    const detailUnavailable = this.allQuestionsUnansweredDueToMissingDetailData();
    const hardestQuestion = detailUnavailable ? null : [...questions].filter(question => question.correctCount + question.wrongCount > 0).sort((a, b) => a.successRate - b.successRate)[0];
    const weakestSkill = detailUnavailable ? null : [...skills].sort((a, b) => a.masteryRate - b.masteryRate)[0];
    const weakestTopic = detailUnavailable ? null : [...topics].sort((a, b) => a.masteryRate - b.masteryRate)[0];
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
  hasMatchingQuestionScore = computed(() => {
    const data = this.dataset();
    if (!data) return false;
    const questionIds = new Set(data.questions.map(question => question.id));
    return data.students.some(student => !student.isAbsent && student.totalScore !== null && student.questionScores.some(score => questionIds.has(score.questionId)));
  });
  allQuestionsUnansweredDueToMissingDetailData = computed(() => questionDetailUnavailable(this.questions(), this.students().filter(student => !student.isAbsent && student.totalScore !== null).length, this.hasMatchingQuestionScore()));
  visibleQuestions = computed(() => filterAndSortQuestions(this.questions(), this.questionSearch(), this.questionSort(), this.questionSortDirection()));
  questionsInsightText = computed(() => {
    const questions = this.questions();
    if (this.allQuestionsUnansweredDueToMissingDetailData()) return 'لا تتوفر درجات تفصيلية على مستوى الأسئلة لهذا الامتحان، لذلك لا يمكن استنتاج أصعب الأسئلة أو مستوى الأداء عليها بدقة.';
    if (!questions.length) return 'لا توجد أسئلة مرتبطة بهذا الامتحان.';
    const withDetail = questions.filter(question => Number.isFinite(question.successRate) && question.correctCount + question.wrongCount > 0);
    if (!withDetail.length) return 'لا تتوفر بيانات تفصيلية كافية لاستخراج مؤشرات الأسئلة.';
    const hardest = [...withDetail].sort((a, b) => a.successRate - b.successRate)[0];
    const hardCount = withDetail.filter(question => question.difficulty === 'صعب').length;
    const averageUnanswered = withDetail.reduce((sum, question) => sum + question.unansweredRate, 0) / withDetail.length;
    const unansweredNote = averageUnanswered > 30 ? ` متوسط عدم الإجابة ${this.format(averageUnanswered)}%.` : '';
    return `أدنى نسبة نجاح في السؤال س${hardest.questionNumber} (${this.format(hardest.successRate)}%)، وعدد الأسئلة المصنفة صعبة ${hardCount}.${unansweredNote}`;
  });
  skills = computed(() => {
    const data = this.dataset();
    return data ? this.calculator.dimensions('skill', data.questions, this.filteredBaseStudents(), this.levels()) : [];
  });
  topics = computed(() => {
    const data = this.dataset();
    return data ? this.calculator.dimensions('topic', data.questions, this.filteredBaseStudents(), this.levels()) : [];
  });
  classifiedTopics = computed(() => this.topics().filter(topic => topic.name !== 'غير مصنف'));
  unclassifiedTopics = computed(() => this.topics().filter(topic => topic.name === 'غير مصنف'));
  unclassifiedTopicQuestionCount = computed(() => this.questions().filter(question => !question.topicId || question.topicName === 'غير مصنف').length);
  visibleTopics = computed(() => filterAndSortTopics(this.classifiedTopics(), this.topicSearch(), this.topicSort()));
  strongTopicLevelId = computed(() => [...this.levels()].sort((left, right) => right.max - left.max)[0]?.id || '');
  weakTopicLevelId = computed(() => [...this.levels()].sort((left, right) => left.min - right.min)[0]?.id || '');
  strongTopicsCount = computed(() => this.classifiedTopics().filter(topic => topic.level.id === this.strongTopicLevelId()).length);
  weakTopicsCount = computed(() => this.classifiedTopics().filter(topic => topic.level.id === this.weakTopicLevelId()).length);
  topicsInsightText = computed(() => {
    const topics = this.classifiedTopics();
    if (!topics.length) return 'لم يتم تصنيف الأسئلة حسب الموضوع لهذا الامتحان — تحقق من ربط الأسئلة بالموضوعات في إعداد بنك الأسئلة.';
    const strongest = [...topics].sort((left, right) => right.masteryRate - left.masteryRate)[0];
    const weakest = [...topics].sort((left, right) => left.masteryRate - right.masteryRate)[0];
    return `أقوى موضوع: ${strongest.name} (${this.format(strongest.masteryRate)}%) · يحتاج دعمًا: ${weakest.name} (${this.format(weakest.masteryRate)}%).`;
  });
  selectedTopicQuestionTypes = computed(() => {
    const topicId = this.selectedTopicId();
    if (!topicId) return [] as { name: string; count: number }[];
    const counts = new Map<string, number>();
    this.questions().filter(question => question.topicId === topicId).forEach(question => counts.set(question.typeName, (counts.get(question.typeName) || 0) + 1));
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'ar'));
  });
  classifiedSkills = computed(() => this.skills().filter(skill => skill.name !== 'غير مصنف'));
  unclassifiedSkills = computed(() => this.skills().filter(skill => skill.name === 'غير مصنف'));
  unclassifiedSkillQuestionCount = computed(() => this.questions().filter(question => !question.skillId || question.skillName === 'غير مصنف').length);
  visibleSkills = computed(() => filterAndSortSkills(this.classifiedSkills(), this.skillSearch(), this.skillSort()));
  strongSkillLevelId = computed(() => [...this.levels()].sort((left, right) => right.max - left.max)[0]?.id || '');
  weakSkillLevelId = computed(() => [...this.levels()].sort((left, right) => left.min - right.min)[0]?.id || '');
  strongSkillsCount = computed(() => this.classifiedSkills().filter(skill => skill.level.id === this.strongSkillLevelId()).length);
  weakSkillsCount = computed(() => this.classifiedSkills().filter(skill => skill.level.id === this.weakSkillLevelId()).length);
  skillsInsightText = computed(() => {
    const skills = this.classifiedSkills();
    if (!skills.length) return 'لم يتم تصنيف الأسئلة حسب المهارات لهذا الامتحان — تحقق من ربط الأسئلة بالمهارات في إعداد بنك الأسئلة.';
    const strongest = [...skills].sort((left, right) => right.masteryRate - left.masteryRate)[0];
    const weakest = [...skills].sort((left, right) => left.masteryRate - right.masteryRate)[0];
    return `أقوى مهارة: ${strongest.name} (${this.format(strongest.masteryRate)}%) · تحتاج دعمًا: ${weakest.name} (${this.format(weakest.masteryRate)}%).`;
  });
  selectedSkillQuestionTypes = computed(() => {
    const skillId = this.selectedSkillId();
    if (!skillId) return [] as { name: string; count: number }[];
    const counts = new Map<string, number>();
    this.questions().filter(question => question.skillId === skillId).forEach(question => counts.set(question.typeName, (counts.get(question.typeName) || 0) + 1));
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'ar'));
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
    return filterAndSortStudents(this.students(), this.studentSearch(), this.levelFilter(), this.studentSort());
  });
  notTestedStudentCount = computed(() => this.students().filter(student => student.isAbsent).length);
  recommendations = computed(() => {
    if (this.allQuestionsUnansweredDueToMissingDetailData()) return [];
    const weakSkills = this.classifiedSkills().filter(item => item.masteryRate < 55);
    const weakTopics = this.classifiedTopics().filter(item => item.masteryRate < 55);
    const hardQuestions = this.questions().filter(item => !this.allQuestionsUnansweredDueToMissingDetailData() && item.difficulty === 'صعب' && item.correctCount + item.wrongCount > 0);
    const interventionStudents = this.students().filter(item => !item.isAbsent && item.normalizedScore < 55);
    const items: RecommendationItem[] = [
      ...weakSkills.map(item => ({ type: 'skill' as const, severity: recommendationSeverity(recommendationPriority(item.masteryRate)), priorityValue: recommendationPriority(item.masteryRate), icon: 'psychology', title: `إعادة تدريس مهارة: ${item.name}`, detail: `نسبة الإتقان ${this.format(item.masteryRate)}%، ويحتاج ${item.supportStudents} طالب إلى تعزيز.`, actionHint: 'مراجعة المهارة في تبويب المهارات', actionTab: 'skills' as AnalysisTab, actionPayload: item.id })),
      ...weakTopics.map(item => ({ type: 'topic' as const, severity: recommendationSeverity(recommendationPriority(item.masteryRate)), priorityValue: recommendationPriority(item.masteryRate), icon: 'menu_book', title: `تعزيز موضوع: ${item.name}`, detail: `متوسط الأداء ${this.format(item.averagePerformance)}%. يُقترح نشاط تطبيقي قصير ثم تقويم تكويني.`, actionHint: 'مراجعة الموضوع في تبويب الموضوعات', actionTab: 'topics' as AnalysisTab, actionPayload: item.id })),
      ...hardQuestions.map(item => ({ type: 'question' as const, severity: recommendationSeverity(recommendationPriority(item.successRate)), priorityValue: recommendationPriority(item.successRate), icon: 'quiz', title: `مراجعة السؤال ${item.questionNumber}`, detail: `نسبة النجاح ${this.format(item.successRate)}% ونسبة عدم الإجابة ${this.format(item.unansweredRate)}%.`, actionHint: 'فتح تفاصيل السؤال', actionTab: 'questions' as AnalysisTab, actionPayload: item.id })),
      ...(interventionStudents.length ? [{ type: 'individual' as const, severity: 'moderate' as const, priorityValue: null, icon: 'person_alert', title: 'تدخل فردي', detail: `${interventionStudents.length} طالب دون مستوى 55% ويحتاجون خطة متابعة قصيرة المدى.`, actionHint: 'مراجعة خطة التدخل', actionTab: 'intervention' as AnalysisTab, actionPayload: null }] : []),
    ];
    return items;
  });
  groupedRecommendations = computed(() => groupRecommendations(this.recommendations()));
  hasRecommendations = computed(() => this.groupedRecommendations().some(group => group.items.length > 0));
  interventionGroups = computed(() => {
    const data = this.dataset();
    const levels = this.levels();
    return buildInterventionGroups(levels, this.students()).map(group => {
      const level = levels.find(candidate => candidate.id === group.levelId);
      const targetedSkills = data && group.students.length ? groupTargetedSkills(this.calculator, data.questions, group.students, levels) : [];
      return {
        ...group,
        targetedSkills,
        successCriterion: level ? interventionSuccessCriterion(level, levels) : 'تحسن قابل للقياس في التقويم اللاحق',
      };
    });
  });
  topInterventionLevelId = computed(() => [...this.levels()].sort((left, right) => right.min - left.min)[0]?.id || '');
  followUpStudentCount = computed(() => countFollowUpStudents(this.interventionGroups(), this.topInterventionLevelId()));
  interventionGroupCount = computed(() => this.interventionGroups().filter(group => group.students.length > 0).length);

  saveInterventionPlan(group: InterventionGroupView): void {
    const data = this.dataset();
    const groups = data?.groups || [];
    const studyGroupId = this.selectedGroupId() !== 'ALL' ? this.selectedGroupId() : groups.length === 1 ? groups[0]?.studyGroupId : '';
    if (!data || !studyGroupId) {
      this.error.set('اختر شعبة واحدة قبل حفظ خطة التدخل للمتابعة.');
      return;
    }
    void this.router.navigate(['/interventions/new'], { queryParams: {
      academicYearId: data.exam.academicYearId, subjectId: data.exam.subjectId, studyGroupId, baselineExamId: data.exam.id,
      title: `خطة ${group.name}`, activity: group.activity, duration: group.duration,
      studentIds: group.students.map(student => student.studentId).join(','), skillIds: group.targetedSkills.map(skill => skill.id).join(','),
    }});
  }

  async ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('tab') === 'intervention') this.activeTab.set('intervention');
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
  setQuestionSort(sort: QuestionSortKey) {
    if (this.questionSort() === sort) {
      this.questionSortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.questionSort.set(sort);
    this.questionSortDirection.set('asc');
  }
  questionSortAria(sort: QuestionSortKey): 'ascending' | 'descending' | 'none' {
    return this.questionSort() === sort ? (this.questionSortDirection() === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  openRecommendation(item: RecommendationItem) {
    this.activeTab.set(item.actionTab);
    if (item.type === 'skill' && item.actionPayload) this.selectedSkillId.set(item.actionPayload);
    if (item.type === 'topic' && item.actionPayload) this.selectedTopicId.set(item.actionPayload);
    if (item.type === 'question' && item.actionPayload) {
      const question = this.questions().find(candidate => candidate.id === item.actionPayload);
      if (question) this.selectedQuestion.set(question);
    }
  }
  levelPercent(count: number) { const total = this.summary().attended; return total ? count / total * 100 : 0; }
  groupComparisons() {
    const data = this.dataset();
    if (!data) return [];
    const names = new Map(data.groups.map(group => [group.studyGroupId, group.studyGroupName || group.nameAr || 'الشعبة']));
    const groupIds = [...new Set(data.students.flatMap(student => student.groupIds?.length ? student.groupIds : student.groupId ? [student.groupId] : []).filter(Boolean))];
    return groupIds.map(groupId => {
      const analyzed = this.calculator.students(data.students.filter(student => student.groupIds?.includes(groupId) || student.groupId === groupId), data.questions, this.questionMaxTotal(), this.levels());
      return { id: groupId, name: names.get(groupId) || analyzed[0]?.groupName || 'الشعبة', summary: this.calculator.summary(analyzed) };
    });
  }
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
