import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { ApiService } from '../../../core/services/api.service';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { selectCurrentAcademicYear } from './school-dashboard.helpers';

export interface SchoolDashboardData {
  context: { academicYear: { id: string; yearLabel: string }; subject: { id: string; nameAr: string } | null };
  summary: { schoolAverage: number | null; examCount: number; participatingStudentCount: number; subjectCount: number; studyGroupCount: number };
  coverage: { subjectsWithExams: number; studyGroupsWithExams: number; subjectsWithTwoExams: number; studyGroupsWithTwoExams: number; examsWithQuestionDetail: number; examsWithoutQuestionDetail: number };
  bySubject: Array<{ id: string; subjectName: string; examCount: number; participatingStudents: number; averagePerformance: number | null; studyGroupCount: number }>;
  byGroup: Array<{ id: string; name: string; examCount: number; averagePerformance: number | null; subjectCount: number; participatingStudents: number }>;
  selectedSubjectGroups?: Array<{ id: string; name: string; examCount: number; averagePerformance: number | null; participatingStudents: number }>;
}

@Component({
  selector: 'app-school-dashboard', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, BaseChartDirective, UiPageHeaderComponent, UiFilterPanelComponent, UiSelectComponent, UiStatCardComponent, UiSectionCardComponent, UiButtonComponent],
  templateUrl: './school-dashboard.component.html', styleUrl: './school-dashboard.component.css', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolDashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly theme = inject(AcademicChartThemeService);
  readonly years = signal<any[]>([]); readonly subjects = signal<any[]>([]); readonly data = signal<SchoolDashboardData | null>(null); readonly loading = signal(false); readonly error = signal('');
  academicYearId = ''; subjectId = '';
  readonly subjectChartData = computed<ChartData<'bar'>>(() => { const colors = readAcademicChartColors(); const rows = this.data()?.bySubject || []; return { labels: rows.map(row => row.subjectName), datasets: [{ label: 'متوسط الأداء', data: rows.map(row => row.averagePerformance ?? 0), backgroundColor: colors.primary, borderRadius: 6, maxBarThickness: 46 }] }; });
  readonly groupChartData = computed<ChartData<'bar'>>(() => { const colors = readAcademicChartColors(); const rows = this.data()?.byGroup || []; return { labels: rows.map(row => row.name), datasets: [{ label: 'متوسط الأداء', data: rows.map(row => row.averagePerformance ?? 0), backgroundColor: colors.success, borderRadius: 6, maxBarThickness: 46 }] }; });
  readonly chartOptions = computed(() => { this.theme.revision(); const base = academicChartOptions<'bar'>(this.theme, 'الأداء حسب المادة أو الشعبة'); const colors = readAcademicChartColors(); return { ...base, scales: { x: { ticks: { color: colors.onSurfaceVariant }, grid: { display: false } }, y: { beginAtZero: true, max: 100, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` }, grid: { color: colors.outline } } } }; });
  readonly selectedGroups = computed(() => this.data()?.selectedSubjectGroups || []);
  readonly kpis = computed(() => { const summary = this.data()?.summary; return [
    { label: 'متوسط الأداء العام', value: summary?.schoolAverage === null || summary?.schoolAverage === undefined ? '—' : `${summary.schoolAverage}%`, icon: 'insights', tone: 'primary' as const },
    { label: 'الامتحانات المحللة', value: summary?.examCount || 0, icon: 'assignment', tone: 'neutral' as const },
    { label: 'الطلاب المشاركون', value: summary?.participatingStudentCount || 0, icon: 'groups', tone: 'success' as const },
    { label: 'المواد المغطاة', value: summary?.subjectCount || 0, icon: 'menu_book', tone: 'neutral' as const },
    { label: 'الشعب المغطاة', value: summary?.studyGroupCount || 0, icon: 'meeting_room', tone: 'warning' as const },
  ]; });

  async ngOnInit(): Promise<void> { await Promise.all([this.api.loadAcademicYears(), this.api.loadSubjects()]); this.years.set(this.api.academicYears()); this.subjects.set(this.api.subjects()); const current = selectCurrentAcademicYear(this.years()); if (current) { this.academicYearId = current.id; await this.load(); } }
  async load(): Promise<void> { if (!this.academicYearId) { this.data.set(null); return; } this.loading.set(true); this.error.set(''); const result = await this.api.loadSchoolDashboard({ academicYearId: this.academicYearId, subjectId: this.subjectId || undefined }); if (result) this.data.set(result as SchoolDashboardData); else { this.data.set(null); this.error.set('تعذر تحميل لوحة المدرسة.'); } this.loading.set(false); }
  async yearChanged(): Promise<void> { this.subjectId = ''; await this.load(); }
  async subjectChanged(): Promise<void> { await this.load(); }
}
