import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { ApiService } from '../../../core/services/api.service';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { MULTI_SELECT_ALL, UiMultiSelectComponent, UiMultiSelectOption } from '../../../shared/components/ui-multi-select/ui-multi-select.component';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { buildDashboardComparisonEntities, compactChartLabel, DashboardComparisonEntity, pruneDashboardSelection, selectCurrentAcademicYear, selectedDashboardIds, sortDashboardExamTrend } from './school-dashboard.helpers';

interface DashboardYear { id: string; yearLabel: string; isCurrent?: boolean }
interface SubjectOption { key: string; nameAr: string; label: string; subjectIds: string[]; academicYearIds: string[] }
interface GradeOption { id: string; nameAr: string; sortOrder: number }
interface ClassOption { id: string; nameAr: string; gradeLevelId: string; gradeLevelName: string; academicYearId: string; yearLabel: string }
interface ExamTypeOption { id: string; nameAr: string; sortOrder: number }
interface PerformanceRow { examCount: number; participatingStudents: number; averagePerformance: number | null }
interface ExamTypePerformanceRow extends PerformanceRow { examTypeId: string; examTypeName: string; sortOrder: number }

export interface SchoolDashboardData {
  context: { academicYears: DashboardYear[]; subject: { key: string; nameAr: string } | null };
  options: { academicYears: DashboardYear[]; subjects: SubjectOption[]; gradeLevels: GradeOption[]; classes: ClassOption[]; examTypes: ExamTypeOption[] };
  summary: { schoolAverage: number | null; examCount: number; participatingStudentCount: number; subjectCount: number; studyGroupCount: number };
  coverage: { subjectsWithExams: number; studyGroupsWithExams: number; subjectsWithTwoExams: number; studyGroupsWithTwoExams: number; examsWithQuestionDetail: number; examsWithoutQuestionDetail: number };
  bySubject: (PerformanceRow & { id: string; subjectKey: string; subjectName: string; academicYearId: string; yearLabel: string; studyGroupCount: number })[];
  byClass: (PerformanceRow & ClassOption & { subjectCount: number })[];
  byGrade: (PerformanceRow & { id: string; nameAr: string; sortOrder: number; subjectCount: number })[];
  byExamType: (PerformanceRow & { academicYearId: string; yearLabel: string; examTypeId: string; examTypeName: string; sortOrder: number })[];
  byClassExamType: (ExamTypePerformanceRow & ClassOption)[];
  byGradeExamType: (ExamTypePerformanceRow & { id: string; nameAr: string; gradeSortOrder: number })[];
  examTrend: (ExamTypePerformanceRow & { examId: string; examDate: string; examTitle: string; academicYearId: string; yearLabel: string })[];
}

@Component({
  selector: 'app-school-dashboard', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, BaseChartDirective, UiPageHeaderComponent, UiFilterPanelComponent, UiSelectComponent, UiStatCardComponent, UiSectionCardComponent, UiButtonComponent, UiMultiSelectComponent],
  templateUrl: './school-dashboard.component.html', styleUrl: './school-dashboard.component.css', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolDashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly theme = inject(AcademicChartThemeService);
  private requestSequence = 0;

  readonly years = signal<DashboardYear[]>([]);
  readonly data = signal<SchoolDashboardData | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedYearIds = signal<string[]>([MULTI_SELECT_ALL]);
  readonly selectedGradeIds = signal<string[]>([MULTI_SELECT_ALL]);
  readonly selectedClassIds = signal<string[]>([MULTI_SELECT_ALL]);
  readonly selectedExamTypeIds = signal<string[]>([MULTI_SELECT_ALL]);
  readonly subjectKey = signal('');

  readonly yearOptions = computed<UiMultiSelectOption[]>(() => this.years().map((year) => ({ id: year.id, label: year.yearLabel })));
  readonly gradeOptions = computed<UiMultiSelectOption[]>(() => (this.data()?.options.gradeLevels || []).map((grade) => ({ id: grade.id, label: grade.nameAr })));
  readonly classOptions = computed<UiMultiSelectOption[]>(() => {
    const gradeIds = selectedDashboardIds(this.selectedGradeIds());
    return (this.data()?.options.classes || []).filter((item) => !gradeIds.length || gradeIds.includes(item.gradeLevelId)).map((item) => ({ id: item.id, label: `${item.nameAr} · ${item.gradeLevelName} · ${item.yearLabel}` }));
  });
  readonly examTypeOptions = computed<UiMultiSelectOption[]>(() => (this.data()?.options.examTypes || []).map((type) => ({ id: type.id, label: type.nameAr })));
  readonly comparisonEntities = computed<DashboardComparisonEntity[]>(() => {
    const dashboard = this.data(); if (!dashboard) return [];
    const selectedClasses = selectedDashboardIds(this.selectedClassIds());
    const grades = selectedClasses.length ? dashboard.options.gradeLevels : [...new Map(dashboard.byGradeExamType.map((row) => [row.id, { id: row.id, nameAr: row.nameAr, sortOrder: row.gradeSortOrder }])).values()];
    return buildDashboardComparisonEntities(this.selectedClassIds(), dashboard.options.classes, grades);
  });
  readonly comparisonExamTypes = computed(() => this.availableExamTypes(this.data()?.byClassExamType || [], this.data()?.byGradeExamType || []));
  readonly trendRows = computed(() => sortDashboardExamTrend(this.data()?.examTrend || []));
  readonly trendExamTypes = computed(() => this.availableExamTypes(this.trendRows()));
  readonly comparisonTitle = computed(() => selectedDashboardIds(this.selectedClassIds()).length ? 'مقارنة أداء الصفوف بمتوسط الطبقة' : 'الأداء حسب المراحل');
  readonly hasNonDefaultFilters = computed(() => {
    const current = selectCurrentAcademicYear(this.years()) || this.years()[0];
    const years = selectedDashboardIds(this.selectedYearIds());
    return years.length !== 1 || years[0] !== current?.id || Boolean(this.subjectKey()) || selectedDashboardIds(this.selectedGradeIds()).length > 0 || selectedDashboardIds(this.selectedClassIds()).length > 0 || selectedDashboardIds(this.selectedExamTypeIds()).length > 0;
  });
  readonly contextSummary = computed(() => {
    const dashboard = this.data();
    if (!dashboard) return '';
    const years = dashboard.context.academicYears.map((year) => year.yearLabel).join('، ');
    const subject = dashboard.context.subject?.nameAr || 'كل المواد';
    return `${years || 'كل السنوات'} · ${subject} · ${this.selectionSummary(this.selectedGradeIds(), this.gradeOptions(), 'كل المراحل')} · ${this.selectionSummary(this.selectedClassIds(), this.classOptions(), 'كل الصفوف')} · ${this.selectionSummary(this.selectedExamTypeIds(), this.examTypeOptions(), 'كل أنواع الامتحانات')}`;
  });

  readonly kpis = computed(() => {
    const summary = this.data()?.summary;
    return [
      { label: 'متوسط الأداء العام', value: summary?.schoolAverage == null ? '—' : `${summary.schoolAverage}%`, icon: 'insights', tone: 'primary' as const },
      { label: 'الامتحانات المحللة', value: summary?.examCount || 0, icon: 'assignment', tone: 'neutral' as const },
      { label: 'الطلاب المشاركون', value: summary?.participatingStudentCount || 0, icon: 'groups', tone: 'success' as const },
      { label: 'المواد المغطاة', value: summary?.subjectCount || 0, icon: 'menu_book', tone: 'neutral' as const },
      { label: 'الشعب المغطاة', value: summary?.studyGroupCount || 0, icon: 'meeting_room', tone: 'warning' as const },
    ];
  });

  readonly subjectChartData = computed<ChartData<'bar'>>(() => {
    const colors = readAcademicChartColors(); const dashboard = this.data();
    const subjects = [...new Map((dashboard?.bySubject || []).map((row) => [row.subjectKey, row.subjectName])).entries()];
    return { labels: subjects.map(([, name]) => compactChartLabel(name)), datasets: (dashboard?.context.academicYears || []).map((year, index) => ({ label: year.yearLabel, data: subjects.map(([key]) => dashboard?.bySubject.find((row) => row.subjectKey === key && row.academicYearId === year.id)?.averagePerformance ?? null), backgroundColor: this.chartColor(index, colors), borderRadius: 5, maxBarThickness: 36 })) };
  });

  readonly comparisonChartData = computed<ChartData<'bar'>>(() => {
    const colors = readAcademicChartColors(); const entities = this.comparisonEntities();
    return { labels: entities.map((entity) => compactChartLabel(entity.label, 24)), datasets: this.comparisonExamTypes().map((type, index) => ({ label: type.nameAr, data: entities.map((entity) => this.comparisonRow(entity, type.id)?.averagePerformance ?? null), backgroundColor: this.chartColor(index, colors), borderRadius: 5, maxBarThickness: 34 })) };
  });

  readonly temporalChartData = computed<ChartData<'line'>>(() => {
    const colors = readAcademicChartColors(); const rows = this.trendRows(); const showYear = new Set(rows.map((row) => row.academicYearId)).size > 1;
    return { labels: rows.map((row) => `${this.formatExamDate(row.examDate)}${showYear ? ` · ${row.yearLabel}` : ''}`), datasets: this.trendExamTypes().map((type, index) => ({ label: type.nameAr, data: rows.map((row) => row.examTypeId === type.id ? row.averagePerformance : null), borderColor: this.chartColor(index, colors), backgroundColor: this.chartColor(index, colors), pointRadius: 4, pointHoverRadius: 6, tension: 0.25, spanGaps: true })) };
  });

  readonly subjectChartOptions = computed<ChartOptions<'bar'>>(() => this.buildChartOptions<'bar'>('متوسط الأداء حسب المادة', (datasetIndex, dataIndex) => {
    const dashboard = this.data(); const year = dashboard?.context.academicYears[datasetIndex];
    const subjectKey = [...new Map((dashboard?.bySubject || []).map((row) => [row.subjectKey, row.subjectName])).keys()][dataIndex];
    const row = dashboard?.bySubject.find((item) => item.academicYearId === year?.id && item.subjectKey === subjectKey);
    return row ? [`الطلاب المشاركون: ${row.participatingStudents}`, `الامتحانات: ${row.examCount}`] : undefined;
  }));
  readonly comparisonChartOptions = computed<ChartOptions<'bar'>>(() => this.buildChartOptions<'bar'>(this.comparisonTitle(), (datasetIndex, dataIndex) => {
    const entity = this.comparisonEntities()[dataIndex]; const type = this.comparisonExamTypes()[datasetIndex]; const row = entity && type ? this.comparisonRow(entity, type.id) : undefined;
    return row ? [`الطلاب المشاركون: ${row.participatingStudents}`, `الامتحانات: ${row.examCount}`] : undefined;
  }));
  readonly lineChartOptions = computed<ChartOptions<'line'>>(() => this.buildChartOptions<'line'>('تطور الأداء حسب نوع الامتحان', (datasetIndex, dataIndex) => {
    const row = this.trendRows()[dataIndex]; const type = this.trendExamTypes()[datasetIndex];
    return row && row.examTypeId === type?.id ? [row.examTitle, `السنة الدراسية: ${row.yearLabel}`, `الطلاب المشاركون: ${row.participatingStudents}`, `الامتحانات: ${row.examCount}`] : undefined;
  }));

  async ngOnInit(): Promise<void> {
    await this.api.loadAcademicYears();
    const years = (this.api.academicYears() as DashboardYear[]).slice(); this.years.set(years);
    const current = selectCurrentAcademicYear(years) || years[0];
    this.selectedYearIds.set(current ? [current.id] : [MULTI_SELECT_ALL]);
    await this.load();
  }

  async yearsChanged(ids: string[]): Promise<void> { this.selectedYearIds.set(ids); this.subjectKey.set(''); this.resetDependencies(); await this.load(); }
  async subjectChanged(key: string): Promise<void> { this.subjectKey.set(key); this.resetDependencies(); await this.load(); }
  async gradesChanged(ids: string[]): Promise<void> { this.selectedGradeIds.set(ids); this.selectedClassIds.set([MULTI_SELECT_ALL]); this.selectedExamTypeIds.set([MULTI_SELECT_ALL]); await this.load(); }
  async classesChanged(ids: string[]): Promise<void> { this.selectedClassIds.set(ids); this.selectedExamTypeIds.set([MULTI_SELECT_ALL]); await this.load(); }
  async examTypesChanged(ids: string[]): Promise<void> { this.selectedExamTypeIds.set(ids); await this.load(); }
  async resetFilters(): Promise<void> { const current = selectCurrentAcademicYear(this.years()) || this.years()[0]; this.selectedYearIds.set(current ? [current.id] : [MULTI_SELECT_ALL]); this.subjectKey.set(''); this.resetDependencies(); await this.load(); }

  async load(): Promise<void> {
    const sequence = ++this.requestSequence; this.loading.set(true); this.error.set('');
    const result = await this.api.loadSchoolDashboard({ academicYearIds: selectedDashboardIds(this.selectedYearIds()), subjectKey: this.subjectKey() || undefined, gradeLevelIds: selectedDashboardIds(this.selectedGradeIds()), classIds: selectedDashboardIds(this.selectedClassIds()), examTypeIds: selectedDashboardIds(this.selectedExamTypeIds()) });
    if (sequence !== this.requestSequence) return;
    if (!result) { this.error.set('تعذّر تحميل سياق المقارنة. حاول مرة أخرى.'); this.loading.set(false); return; }
    const dashboard = result as SchoolDashboardData; this.data.set(dashboard);
    this.selectedGradeIds.set(pruneDashboardSelection(this.selectedGradeIds(), dashboard.options.gradeLevels.map((row) => row.id)));
    this.selectedClassIds.set(pruneDashboardSelection(this.selectedClassIds(), dashboard.options.classes.map((row) => row.id)));
    this.selectedExamTypeIds.set(pruneDashboardSelection(this.selectedExamTypeIds(), dashboard.options.examTypes.map((row) => row.id)));
    this.loading.set(false);
  }

  private resetDependencies(): void { this.selectedGradeIds.set([MULTI_SELECT_ALL]); this.selectedClassIds.set([MULTI_SELECT_ALL]); this.selectedExamTypeIds.set([MULTI_SELECT_ALL]); }
  private selectionSummary(ids: string[], options: UiMultiSelectOption[], allLabel: string): string { const selected = selectedDashboardIds(ids); if (!selected.length) return allLabel; const labels = options.filter((option) => selected.includes(option.id)).map((option) => option.label); return labels.length <= 2 ? labels.join('، ') : `${labels.length} محددة`; }
  private chartColor(index: number, colors: ReturnType<typeof readAcademicChartColors>): string { return [colors.primary, colors.success, colors.warning, colors.danger][index % 4]; }
  private availableExamTypes(...rows: ExamTypePerformanceRow[][]): ExamTypeOption[] {
    const availableIds = new Set(rows.flat().map((row) => row.examTypeId));
    return (this.data()?.options.examTypes || []).filter((type) => availableIds.has(type.id));
  }
  private comparisonRow(entity: DashboardComparisonEntity, examTypeId: string): ExamTypePerformanceRow | undefined {
    const dashboard = this.data();
    return entity.kind === 'class'
      ? dashboard?.byClassExamType.find((row) => row.id === entity.id && row.examTypeId === examTypeId)
      : dashboard?.byGradeExamType.find((row) => row.id === entity.id && row.examTypeId === examTypeId);
  }
  private formatExamDate(value: string): string {
    return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
  }
  private buildChartOptions<T extends 'bar' | 'line'>(title: string, details?: (datasetIndex: number, dataIndex: number) => string | string[] | undefined): ChartOptions<T> {
    this.theme.revision(); const colors = readAcademicChartColors(); const base = academicChartOptions<T>(this.theme, title); const plugins = base?.plugins;
    return { ...(base || {}), plugins: { ...plugins, legend: { ...plugins?.legend, display: true, position: 'bottom', rtl: true }, tooltip: { ...plugins?.tooltip, callbacks: { ...plugins?.tooltip?.callbacks, label: (context: TooltipItem<T>) => `${(context.dataset as { label?: string }).label || 'الأداء'}: ${context.formattedValue}%`, afterLabel: (context: TooltipItem<T>) => details?.(context.datasetIndex, context.dataIndex) || '' } } }, scales: { x: { ticks: { color: colors.onSurfaceVariant, autoSkip: true, maxRotation: 0, minRotation: 0 }, grid: { display: false } }, y: { beginAtZero: true, max: 100, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` }, grid: { color: colors.outline } } } } as unknown as ChartOptions<T>;
  }
}
