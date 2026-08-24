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
import { ProgressTrackingResponse, StudentParticipationStatus, StudentProgressResponse } from '../models/progress-tracking.model';

export function usableProgressPoints(points: ProgressTrackingResponse['points']) {
  return points.filter((point) => !point.noData && point.averagePercentage !== null);
}

export function classContextComplete(yearId: string, subjectId: string, studyGroupId: string): boolean {
  return Boolean(yearId && subjectId && studyGroupId);
}

export function studentContextComplete(yearId: string, subjectId: string, studyGroupId: string, studentId: string): boolean {
  return classContextComplete(yearId, subjectId, studyGroupId) && Boolean(studentId);
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

@Component({
  selector: 'app-progress-tracking',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, UiButtonComponent, UiEmptyStateComponent, UiFilterPanelComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent, UiStatCardComponent, UiTableActionsComponent, ProgressTrendChartComponent, StudentProgressTrendChartComponent],
  templateUrl: './progress-tracking.component.html',
  styleUrl: './progress-tracking.component.css',
})
export class ProgressTrackingComponent {
  readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly selectedYearId = signal('');
  readonly selectedSubjectId = signal('');
  readonly selectedStudyGroupId = signal('');
  readonly selectedStudentId = signal('');
  readonly mode = signal<'class' | 'student'>('class');
  readonly availableStudyGroups = signal<any[]>([]);
  readonly groupsLoading = signal(false);
  readonly groupMembers = signal<any[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly response = signal<ProgressTrackingResponse | null>(null);
  readonly studentResponse = signal<StudentProgressResponse | null>(null);
  private readonly route = inject(ActivatedRoute);
  private requestSequence = 0;
  private groupRequestSequence = 0;

  readonly subjectsForYear = computed(() => this.api.subjects().filter((subject: any) => subject.academicYearId === this.selectedYearId() && subject.isActive !== false && !subject.archivedAt));
  readonly groupsForSubject = computed(() => this.availableStudyGroups());
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

  constructor() {
    this.mode.set(this.route.snapshot.queryParamMap.get('mode') === 'student' ? 'student' : 'class');
    const currentYear = this.api.selectedAcademicYearId() || this.api.academicYears().find((year: any) => year.isCurrent)?.id || this.api.academicYears()[0]?.id || '';
    this.selectedYearId.set(currentYear);
  }

  onModeChange(value: 'class' | 'student'): void {
    this.mode.set(value); this.response.set(null); this.studentResponse.set(null); this.selectedStudentId.set('');
    if (value === 'class' && classContextComplete(this.selectedYearId(), this.selectedSubjectId(), this.selectedStudyGroupId())) void this.load();
    if (value === 'student' && this.selectedStudyGroupId()) void this.loadGroupMembers(this.selectedStudyGroupId());
    void this.router.navigate([], { queryParams: { mode: value === 'student' ? 'student' : null }, queryParamsHandling: 'merge' });
  }
  onYearChange(value: string): void { this.selectedYearId.set(value); this.selectedSubjectId.set(''); this.selectedStudyGroupId.set(''); this.selectedStudentId.set(''); this.groupMembers.set([]); this.availableStudyGroups.set([]); this.groupsLoading.set(false); this.groupRequestSequence++; this.response.set(null); this.studentResponse.set(null); }
  onSubjectChange(value: string): void { this.selectedSubjectId.set(value); this.selectedStudyGroupId.set(''); this.selectedStudentId.set(''); this.groupMembers.set([]); this.availableStudyGroups.set([]); this.response.set(null); this.studentResponse.set(null); void this.loadStudyGroupsForSelection(); }
  onStudyGroupChange(value: string): void {
    this.selectedStudyGroupId.set(value); this.selectedStudentId.set(''); this.response.set(null); this.studentResponse.set(null);
    if (!value) return;
    if (this.mode() === 'class') void this.load();
    else void this.loadGroupMembers(value);
  }
  onStudentChange(value: string): void { this.selectedStudentId.set(value); void this.loadStudent(); }
  async loadGroupMembers(groupId: string): Promise<void> { this.groupMembers.set(await this.api.loadGroupMembers(groupId)); }
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
    const studyGroupId = this.selectedStudyGroupId();
    if (this.mode() !== 'class' || !classContextComplete(academicYearId, subjectId, studyGroupId)) { this.response.set(null); return; }
    const sequence = ++this.requestSequence;
    this.loading.set(true); this.error.set('');
    try {
      const payload = await this.api.loadProgressTracking({ academicYearId, subjectId, studyGroupId });
      if (sequence !== this.requestSequence) return;
      if (!payload) throw new Error('load failed');
      this.response.set(payload as ProgressTrackingResponse);
    } catch { if (sequence === this.requestSequence) { this.response.set(null); this.error.set('تعذر تحميل مسار التقدم.'); } }
    finally { if (sequence === this.requestSequence) this.loading.set(false); }
  }
  async loadStudent(): Promise<void> {
    const academicYearId = this.selectedYearId();
    const subjectId = this.selectedSubjectId();
    const studyGroupId = this.selectedStudyGroupId();
    const studentId = this.selectedStudentId();
    if (this.mode() !== 'student' || !studentContextComplete(academicYearId, subjectId, studyGroupId, studentId)) { this.studentResponse.set(null); return; }
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
  openExam(examId: string): void { void this.router.navigate(['/exam-analysis', examId]); }
  format(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`; }
  formatGap(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} نقطة`; }
  participationLabel(value: StudentParticipationStatus): string { return studentParticipationLabel(value); }
}
