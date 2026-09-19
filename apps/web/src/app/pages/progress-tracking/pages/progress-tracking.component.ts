import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../../../shared/components/ui-empty-state/ui-empty-state.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { ProgressTrendChartComponent } from '../components/progress-trend-chart.component';
import { StudentProgressTrendChartComponent } from '../components/student-progress-trend-chart.component';
import { DimensionProgressResponse, DimensionProgressStatus, DimensionType, ProgressTrackingResponse, StudentParticipationStatus, StudentProgressResponse } from '../models/progress-tracking.model';
import { DimensionProgressTrendChartComponent } from '../components/dimension-progress-trend-chart.component';

export const ALL_GRADE_CLASSES = 'ALL';

interface ProgressGradeLevel {
  id: string;
  nameAr: string;
  nameHe?: string | null;
  sortOrder: number;
}

interface ProgressStudyGroup {
  id: string;
  nameAr: string;
  nameHe?: string | null;
  classId: string;
  subjectId: string;
  classRoom: {
    id: string;
    nameAr: string;
    nameHe?: string | null;
    gradeLevelId: string;
    gradeLevel: ProgressGradeLevel;
  };
}

export function usableProgressPoints(points: ProgressTrackingResponse['points']) {
  return points.filter((point) => !point.noData && point.averagePercentage !== null);
}

export function classContextComplete(yearId: string, subjectId: string, gradeLevelId: string, studyGroupId: string): boolean {
  return Boolean(yearId && subjectId && gradeLevelId && studyGroupId);
}

export function isSpecificStudyGroup(studyGroupId: string): boolean {
  return Boolean(studyGroupId && studyGroupId !== ALL_GRADE_CLASSES);
}

export function studentContextComplete(yearId: string, subjectId: string, gradeLevelId: string, studyGroupId: string, studentId: string): boolean {
  return classContextComplete(yearId, subjectId, gradeLevelId, studyGroupId) && isSpecificStudyGroup(studyGroupId) && Boolean(studentId);
}

export function progressSummaryText(points: ProgressTrackingResponse['points']): string {
  const usable = usableProgressPoints(points);
  if (usable.length < 2) return '';
  const first = usable[0].averagePercentage!;
  const latest = usable[usable.length - 1].averagePercentage!;
  return `${latest >= first ? 'ارتفع' : 'انخفض'} متوسط الأداء من ${first.toFixed(1)}% إلى ${latest.toFixed(1)}% عبر ${usable.length} امتحانات.`;
}

export function studentInsightText(response: StudentProgressResponse): string {
  const completed = response.points.filter((point) => point.participationStatus === 'completed' && point.studentPercentage !== null);
  if (completed.length < 2) return 'لا تتوفر بيانات مكتملة كافية لقياس اتجاه الطالب.';
  const change = response.summary.change ?? 0;
  const gap = response.summary.currentGroupGap;
  return `${change >= 0 ? 'ارتفع' : 'انخفض'} أداء الطالب بمقدار ${Math.abs(change).toFixed(1)} نقطة مئوية، والفجوة الحالية عن متوسط الشعبة ${gap == null ? 'غير متاحة' : `${gap >= 0 ? '+' : ''}${gap.toFixed(1)} نقطة`}.`;
}

export function studentParticipationLabel(value: StudentParticipationStatus): string {
  return value === 'completed' ? 'مكتمل' : value === 'absent' ? 'غائب' : 'لا توجد نتيجة';
}

export function dimensionStatusLabel(value: DimensionProgressStatus): string {
  return value === 'measured' ? 'مقاس' : value === 'notMeasured' ? 'غير مقاس' : 'تفاصيل القياس غير متاحة';
}

export function dimensionCoverageText(measured: number, total: number): string { return `${measured} / ${total} امتحان مقاس`; }
export function dimensionCanShowTrend(measured: number): boolean { return measured >= 2; }

@Component({
  selector: 'app-progress-tracking',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, UiButtonComponent, UiEmptyStateComponent, UiFilterPanelComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent, UiStatCardComponent, UiTableActionsComponent, ProgressTrendChartComponent, StudentProgressTrendChartComponent, DimensionProgressTrendChartComponent],
  templateUrl: './progress-tracking.component.html',
  styleUrl: './progress-tracking.component.css',
})
export class ProgressTrackingComponent {
  readonly isSpecificStudyGroup = isSpecificStudyGroup;
  readonly allGradeClasses = ALL_GRADE_CLASSES;
  readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly selectedYearId = signal('');
  readonly selectedSubjectId = signal('');
  readonly selectedGradeLevelId = signal('');
  readonly selectedStudyGroupId = signal('');
  readonly selectedStudentId = signal('');
  readonly mode = signal<'class' | 'student' | 'dimensions'>('class');
  readonly dimensionType = signal<DimensionType>('skill');
  readonly availableStudyGroups = signal<ProgressStudyGroup[]>([]);
  readonly groupsLoading = signal(false);
  readonly groupMembers = signal<any[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly response = signal<ProgressTrackingResponse | null>(null);
  readonly studentResponse = signal<StudentProgressResponse | null>(null);
  readonly dimensionResponse = signal<DimensionProgressResponse | null>(null);
  private readonly route = inject(ActivatedRoute);
  private requestSequence = 0;
  private groupRequestSequence = 0;
  private memberRequestSequence = 0;

  readonly subjectsForYear = computed(() => this.api.subjects().filter((subject: any) => subject.academicYearId === this.selectedYearId() && subject.isActive !== false && !subject.archivedAt));
  readonly gradeOptions = computed(() => {
    const grades = new Map<string, ProgressGradeLevel>();
    for (const group of this.availableStudyGroups()) grades.set(group.classRoom.gradeLevel.id, group.classRoom.gradeLevel);
    return [...grades.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.nameAr.localeCompare(right.nameAr, 'ar'));
  });
  readonly groupsForSelectedGrade = computed(() => this.availableStudyGroups().filter((group) => group.classRoom.gradeLevelId === this.selectedGradeLevelId()));
  readonly progressContextLabel = computed(() => {
    const grade = this.gradeOptions().find((item) => item.id === this.selectedGradeLevelId());
    const group = this.groupsForSelectedGrade().find((item) => item.id === this.selectedStudyGroupId());
    if (!grade) return '';
    return `${grade.nameAr} · ${this.selectedStudyGroupId() === ALL_GRADE_CLASSES ? 'كل الصفوف' : group?.classRoom.nameAr || group?.nameAr || ''}`;
  });
  readonly points = computed(() => this.response()?.points || []);
  readonly hasTrend = computed(() => usableProgressPoints(this.points()).length >= 2);
  readonly firstAverage = computed(() => this.response()?.summary.firstAverage);
  readonly latestAverage = computed(() => this.response()?.summary.latestAverage);
  readonly averageChange = computed(() => this.response()?.summary.averageChange);
  readonly summaryText = computed(() => {
    return progressSummaryText(this.points());
  });
  readonly studentPoints = computed(() => this.studentResponse()?.points || []);
  readonly studentCompletedPoints = computed(() => this.studentPoints().filter((point) => point.participationStatus === 'completed' && point.studentPercentage !== null));
  readonly studentsForGroup = computed(() => this.groupMembers());
  readonly studentInsight = computed(() => {
    const response = this.studentResponse();
    return response ? studentInsightText(response) : '';
  });
  readonly selectedDimension = computed(() => this.dimensionResponse()?.selectedDimension || null);
  readonly dimensionPoints = computed(() => this.dimensionResponse()?.points || []);
  readonly dimensionsForSelection = computed(() => this.dimensionResponse()?.availableDimensions || []);
  readonly dimensionCanShowTrend = computed(() => dimensionCanShowTrend(this.selectedDimension()?.measuredExamCount || 0));

  constructor() {
    const routeMode = this.route.snapshot.queryParamMap.get('mode');
    this.mode.set(routeMode === 'student' || routeMode === 'dimensions' ? routeMode : 'class');
    const currentYear = this.api.selectedAcademicYearId() || this.api.academicYears().find((year: any) => year.isCurrent)?.id || this.api.academicYears()[0]?.id || '';
    this.selectedYearId.set(currentYear);
  }

  onModeChange(value: 'class' | 'student' | 'dimensions'): void {
    this.requestSequence++; this.loading.set(false); this.error.set(''); this.mode.set(value); this.response.set(null); this.studentResponse.set(null); this.selectedStudentId.set('');
    if (value === 'class' && classContextComplete(this.selectedYearId(), this.selectedSubjectId(), this.selectedGradeLevelId(), this.selectedStudyGroupId())) void this.load();
    if (value === 'student' && isSpecificStudyGroup(this.selectedStudyGroupId())) void this.loadGroupMembers(this.selectedStudyGroupId());
    if (value === 'dimensions' && isSpecificStudyGroup(this.selectedStudyGroupId())) void this.loadDimensions();
    void this.router.navigate([], { queryParams: { mode: value === 'class' ? null : value }, queryParamsHandling: 'merge' });
  }
  onYearChange(value: string): void { this.requestSequence++; this.memberRequestSequence++; this.loading.set(false); this.error.set(''); this.selectedYearId.set(value); this.selectedSubjectId.set(''); this.selectedGradeLevelId.set(''); this.selectedStudyGroupId.set(''); this.selectedStudentId.set(''); this.groupMembers.set([]); this.availableStudyGroups.set([]); this.groupsLoading.set(false); this.groupRequestSequence++; this.response.set(null); this.studentResponse.set(null); this.dimensionResponse.set(null); }
  onSubjectChange(value: string): void { this.requestSequence++; this.memberRequestSequence++; this.loading.set(false); this.error.set(''); this.selectedSubjectId.set(value); this.selectedGradeLevelId.set(''); this.selectedStudyGroupId.set(''); this.selectedStudentId.set(''); this.groupMembers.set([]); this.availableStudyGroups.set([]); this.response.set(null); this.studentResponse.set(null); this.dimensionResponse.set(null); void this.loadStudyGroupsForSelection(); }
  onGradeLevelChange(value: string): void {
    this.requestSequence++; this.memberRequestSequence++; this.loading.set(false); this.selectedGradeLevelId.set(value); this.selectedStudyGroupId.set(value ? ALL_GRADE_CLASSES : ''); this.selectedStudentId.set(''); this.groupMembers.set([]); this.response.set(null); this.studentResponse.set(null); this.dimensionResponse.set(null); this.error.set('');
    if (value && this.mode() === 'class') void this.load();
  }
  onStudyGroupChange(value: string): void {
    this.requestSequence++; this.memberRequestSequence++; this.loading.set(false); this.selectedStudyGroupId.set(value); this.selectedStudentId.set(''); this.groupMembers.set([]); this.response.set(null); this.studentResponse.set(null); this.dimensionResponse.set(null); this.error.set('');
    if (!value) return;
    if (this.mode() === 'class') void this.load();
    else if (this.mode() === 'student' && isSpecificStudyGroup(value)) void this.loadGroupMembers(value);
    else if (this.mode() === 'dimensions' && isSpecificStudyGroup(value)) void this.loadDimensions();
  }
  onDimensionTypeChange(value: DimensionType): void { this.dimensionType.set(value); this.dimensionResponse.set(null); if (isSpecificStudyGroup(this.selectedStudyGroupId())) void this.loadDimensions(); }
  onDimensionChange(value: string): void { if (value) void this.loadDimensions(value); }
  onStudentChange(value: string): void { this.selectedStudentId.set(value); void this.loadStudent(); }
  async loadGroupMembers(groupId: string): Promise<void> {
    const sequence = ++this.memberRequestSequence;
    const members = await this.api.loadGroupMembers(groupId);
    if (sequence === this.memberRequestSequence && this.selectedStudyGroupId() === groupId) this.groupMembers.set(members);
  }
  async loadStudyGroupsForSelection(): Promise<void> {
    const academicYearId = this.selectedYearId();
    const subjectId = this.selectedSubjectId();
    const sequence = ++this.groupRequestSequence;
    if (!academicYearId || !subjectId) { this.availableStudyGroups.set([]); this.groupsLoading.set(false); return; }
    this.groupsLoading.set(true);
    try {
      const groups = await this.api.loadProgressTrackingStudyGroups({ academicYearId, subjectId });
      if (sequence === this.groupRequestSequence) this.availableStudyGroups.set(Array.isArray(groups) ? groups : []);
    } finally {
      if (sequence === this.groupRequestSequence) this.groupsLoading.set(false);
    }
  }
  async load(): Promise<void> {
    const academicYearId = this.selectedYearId();
    const subjectId = this.selectedSubjectId();
    const gradeLevelId = this.selectedGradeLevelId();
    const studyGroupId = this.selectedStudyGroupId();
    if (this.mode() !== 'class' || !classContextComplete(academicYearId, subjectId, gradeLevelId, studyGroupId)) { this.response.set(null); return; }
    const sequence = ++this.requestSequence;
    this.loading.set(true); this.error.set('');
    try {
      const payload = await this.api.loadProgressTracking({ academicYearId, subjectId, gradeLevelId, ...(isSpecificStudyGroup(studyGroupId) ? { studyGroupId } : {}) });
      if (sequence !== this.requestSequence) return;
      if (!payload) throw new Error('load failed');
      this.response.set(payload as ProgressTrackingResponse);
    } catch { if (sequence === this.requestSequence) { this.response.set(null); this.error.set('تعذر تحميل مسار التقدم.'); } }
    finally { if (sequence === this.requestSequence) this.loading.set(false); }
  }
  async loadStudent(): Promise<void> {
    const academicYearId = this.selectedYearId();
    const subjectId = this.selectedSubjectId();
    const gradeLevelId = this.selectedGradeLevelId();
    const studyGroupId = this.selectedStudyGroupId();
    const studentId = this.selectedStudentId();
    if (this.mode() !== 'student' || !studentContextComplete(academicYearId, subjectId, gradeLevelId, studyGroupId, studentId)) { this.studentResponse.set(null); return; }
    const sequence = ++this.requestSequence;
    this.loading.set(true); this.error.set('');
    try {
      const payload = await this.api.loadStudentProgressTracking({ academicYearId, subjectId, studyGroupId, studentId });
      if (sequence !== this.requestSequence) return;
      if (!payload) throw new Error('load failed');
      this.studentResponse.set(payload as StudentProgressResponse);
    } catch { if (sequence === this.requestSequence) { this.studentResponse.set(null); this.error.set('تعذر تحميل مسار الطالب.'); } }
    finally { if (sequence === this.requestSequence) this.loading.set(false); }
  }
  async loadDimensions(dimensionId = ''): Promise<void> {
    const academicYearId = this.selectedYearId(); const subjectId = this.selectedSubjectId(); const studyGroupId = this.selectedStudyGroupId();
    if (this.mode() !== 'dimensions' || !isSpecificStudyGroup(studyGroupId)) { this.dimensionResponse.set(null); return; }
    const sequence = ++this.requestSequence; this.loading.set(true); this.error.set('');
    try {
      const payload = await this.api.loadProgressTrackingDimensions({ academicYearId, subjectId, studyGroupId, dimension: this.dimensionType(), ...(dimensionId ? { dimensionId } : {}) });
      if (sequence !== this.requestSequence) return;
      if (!payload) throw new Error('load failed');
      this.dimensionResponse.set(payload as DimensionProgressResponse);
    } catch { if (sequence === this.requestSequence) { this.dimensionResponse.set(null); this.error.set('تعذر تحميل مسار المهارات والموضوعات.'); } }
    finally { if (sequence === this.requestSequence) this.loading.set(false); }
  }
  openExam(examId: string): void { void this.router.navigate(['/exam-analysis', examId]); }
  format(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`; }
  formatGap(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} نقطة`; }
  participationLabel(value: StudentParticipationStatus): string { return studentParticipationLabel(value); }
  dimensionStatus(value: DimensionProgressStatus): string { return dimensionStatusLabel(value); }
  dimensionCoverage(measured: number, total: number): string { return dimensionCoverageText(measured, total); }
  dimensionDisplayName(name: string): string {
    const subjectName = this.api.subjects().find((subject: any) => subject.id === this.selectedSubjectId())?.nameAr;
    const suffix = subjectName ? ` — ${subjectName}` : '';
    return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
  }
  formatNullable(value: number | null): string { return value == null ? 'غير متاح' : `${value.toFixed(1)}%`; }
}
