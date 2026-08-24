import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import { ProgressTrackingResponse } from '../models/progress-tracking.model';

export function usableProgressPoints(points: ProgressTrackingResponse['points']) {
  return points.filter((point) => !point.noData && point.averagePercentage !== null);
}

export function progressSummaryText(points: ProgressTrackingResponse['points']): string {
  const usable = usableProgressPoints(points);
  if (usable.length < 2) return '';
  const first = usable[0].averagePercentage!;
  const latest = usable[usable.length - 1].averagePercentage!;
  return `${latest >= first ? 'ارتفع' : 'انخفض'} متوسط الأداء من ${first.toFixed(1)}% إلى ${latest.toFixed(1)}% عبر ${usable.length} امتحانات.`;
}

@Component({
  selector: 'app-progress-tracking',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, UiButtonComponent, UiEmptyStateComponent, UiFilterPanelComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent, UiStatCardComponent, UiTableActionsComponent, ProgressTrendChartComponent],
  templateUrl: './progress-tracking.component.html',
  styleUrl: './progress-tracking.component.css',
})
export class ProgressTrackingComponent {
  readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly selectedYearId = signal('');
  readonly selectedSubjectId = signal('');
  readonly selectedStudyGroupId = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly response = signal<ProgressTrackingResponse | null>(null);
  private requestSequence = 0;

  readonly subjectsForYear = computed(() => this.api.subjects().filter((subject: any) => subject.academicYearId === this.selectedYearId() && subject.isActive !== false && !subject.archivedAt));
  readonly groupsForSubject = computed(() => this.api.studyGroups().filter((group: any) => group.academicYearId === this.selectedYearId() && group.subjectId === this.selectedSubjectId() && group.isActive !== false && !group.archivedAt));
  readonly points = computed(() => this.response()?.points || []);
  readonly hasTrend = computed(() => usableProgressPoints(this.points()).length >= 2);
  readonly firstAverage = computed(() => this.response()?.summary.firstAverage);
  readonly latestAverage = computed(() => this.response()?.summary.latestAverage);
  readonly averageChange = computed(() => this.response()?.summary.averageChange);
  readonly summaryText = computed(() => {
    return progressSummaryText(this.points());
  });

  constructor() {
    const currentYear = this.api.selectedAcademicYearId() || this.api.academicYears().find((year: any) => year.isCurrent)?.id || this.api.academicYears()[0]?.id || '';
    this.selectedYearId.set(currentYear);
  }

  onYearChange(value: string): void { this.selectedYearId.set(value); this.selectedSubjectId.set(''); this.selectedStudyGroupId.set(''); this.response.set(null); }
  onSubjectChange(value: string): void { this.selectedSubjectId.set(value); this.selectedStudyGroupId.set(''); this.response.set(null); }
  onStudyGroupChange(value: string): void { this.selectedStudyGroupId.set(value); void this.load(); }
  async load(): Promise<void> {
    const academicYearId = this.selectedYearId();
    const subjectId = this.selectedSubjectId();
    const studyGroupId = this.selectedStudyGroupId();
    if (!academicYearId || !subjectId || !studyGroupId) { this.response.set(null); return; }
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
  openExam(examId: string): void { void this.router.navigate(['/exam-analysis', examId]); }
  format(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`; }
}
