import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../../core/services/api.service';
import { StaffDevelopmentAnalysis, StaffDevelopmentAnalysisAggregate, StaffDevelopmentParticipationStatus } from '../../../core/models/api.models';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiBadgeComponent } from '../../../shared/components/ui-badge/ui-badge.component';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';

@Component({
  selector: 'app-staff-development-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, BaseChartDirective, UiPageHeaderComponent, UiFilterPanelComponent, UiSelectComponent, UiStatCardComponent, UiBadgeComponent],
  templateUrl: './staff-development-analysis.component.html',
  styleUrl: './staff-development-analysis.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffDevelopmentAnalysisComponent implements OnInit {
  readonly api = inject(ApiService);
  private readonly theme = inject(AcademicChartThemeService);
  private requestSequence = 0;

  readonly selectedYearId = signal('ALL');
  readonly selectedSpecializationId = signal('ALL');
  readonly selectedStaffId = signal('ALL');
  readonly selectedProviderId = signal('ALL');
  readonly selectedCompletion = signal('ALL');
  readonly participationStatus = signal<StaffDevelopmentParticipationStatus>('all');
  readonly analysis = signal<StaffDevelopmentAnalysis | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');

  readonly years = computed(() => this.api.academicYears());
  readonly specializations = computed(() => (this.api.publicLookups()['specializations'] || []).filter((item: any) => item.isActive !== false));
  readonly providers = computed(() => (this.api.publicLookups()['providers'] || []).filter((item: any) => item.isActive !== false));
  readonly completions = computed(() => this.analysis()?.options.completions || []);
  readonly staffOptions = computed(() => this.api.staff().filter((staff) => !staff.archivedAt && (this.selectedSpecializationId() === 'ALL' || staff.specializationId === this.selectedSpecializationId())));
  readonly summary = computed(() => this.analysis()?.summary || { activeStaff: 0, participatingStaff: 0, nonParticipatingStaff: 0, totalRecords: 0, totalHours: 0, averageHours: 0, distinctProviders: 0, distinctCompletions: 0 });
  readonly teacherRows = computed(() => this.analysis()?.rows || []);
  readonly hasChartData = computed(() => this.summary().totalRecords > 0);

  readonly yearlyChartData = computed<ChartData<'line'>>(() => {
    const colors = readAcademicChartColors(); const rows = this.analysis()?.aggregates.yearly || [];
    return { labels: rows.map(row => row.label), datasets: [{ label: 'إجمالي الساعات', data: rows.map(row => row.hours), borderColor: colors.primary, backgroundColor: colors.primary, tension: 0.25, fill: false }] };
  });
  readonly specialtyChartData = computed(() => this.verticalData(this.analysis()?.aggregates.specialties || [], 'إجمالي الساعات', 'hours'));
  readonly providerChartData = computed(() => this.horizontalData(this.analysis()?.aggregates.providers || [], 'إجمالي الساعات', 'hours'));
  readonly completionParticipationData = computed(() => this.horizontalData([...(this.analysis()?.aggregates.completions || [])].sort((a, b) => b.staff - a.staff || b.hours - a.hours), 'عدد الموظفين', 'staff'));
  readonly completionHoursData = computed(() => this.horizontalData(this.analysis()?.aggregates.completions || [], 'إجمالي الساعات', 'hours'));
  readonly coverageChartData = computed<ChartData<'doughnut'>>(() => ({ labels: ['شارك', 'لم يشارك'], datasets: [{ data: [this.summary().participatingStaff, this.summary().nonParticipatingStaff], backgroundColor: [readAcademicChartColors().success, readAcademicChartColors().warning], borderColor: readAcademicChartColors().surface, borderWidth: 2 }] }));

  readonly lineOptions = computed(() => this.options('line', 'اتجاه ساعات التطوير عبر السنوات'));
  readonly barOptions = computed(() => this.options('bar', 'تحليل ساعات التطوير'));
  readonly specialtyBarOptions = computed(() => this.options('bar', 'ساعات التطوير حسب التخصص', 'x'));
  readonly doughnutOptions = computed(() => this.options('doughnut', 'تغطية الكادر بالتطوير المهني'));

  async ngOnInit(): Promise<void> {
    await Promise.all([this.api.loadStaff(), this.api.loadPublicLookups(), this.api.loadAcademicYears()]);
    await this.loadAnalysis();
  }

  async yearChanged(value: string): Promise<void> { this.selectedYearId.set(value); await this.loadAnalysis(); }
  async specializationChanged(value: string): Promise<void> { this.selectedSpecializationId.set(value); this.selectedStaffId.set('ALL'); await this.loadAnalysis(); }
  async staffChanged(value: string): Promise<void> { this.selectedStaffId.set(value); await this.loadAnalysis(); }
  async providerChanged(value: string): Promise<void> { this.selectedProviderId.set(value); await this.loadAnalysis(); }
  async completionChanged(value: string): Promise<void> { this.selectedCompletion.set(value); await this.loadAnalysis(); }
  async participationChanged(value: StaffDevelopmentParticipationStatus): Promise<void> { this.participationStatus.set(value); await this.loadAnalysis(); }

  async resetFilters(): Promise<void> {
    this.selectedYearId.set('ALL'); this.selectedSpecializationId.set('ALL'); this.selectedStaffId.set('ALL'); this.selectedProviderId.set('ALL'); this.selectedCompletion.set('ALL'); this.participationStatus.set('all');
    await this.loadAnalysis();
  }

  async loadAnalysis(): Promise<void> {
    const sequence = ++this.requestSequence; this.loading.set(true); this.loadError.set('');
    const year = this.years().find((item) => item.id === this.selectedYearId());
    const result = await this.api.loadStaffDevelopmentAnalysis({
      specializationId: this.selectedSpecializationId() === 'ALL' ? undefined : this.selectedSpecializationId(),
      staffMemberId: this.selectedStaffId() === 'ALL' ? undefined : this.selectedStaffId(),
      providerId: this.selectedProviderId() === 'ALL' ? undefined : this.selectedProviderId(),
      courseCode: this.selectedCompletion() === 'ALL' ? undefined : this.selectedCompletion(),
      startDate: year?.startDate,
      endDate: year?.endDate,
      participationStatus: this.participationStatus(),
    });
    if (sequence !== this.requestSequence) return;
    if (!result) this.loadError.set('تعذّر تحميل تحليل تغطية الكادر. حاول مرة أخرى.');
    else this.analysis.set(result);
    this.loading.set(false);
  }

  private horizontalData(rows: StaffDevelopmentAnalysisAggregate[], label: string, metric: 'hours' | 'staff'): ChartData<'bar'> { const colors = readAcademicChartColors(); return { labels: rows.map(row => row.label), datasets: [{ label, data: rows.map(row => metric === 'staff' ? row.staff : row.hours), backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 5, maxBarThickness: 28 }] }; }
  private verticalData(rows: StaffDevelopmentAnalysisAggregate[], label: string, metric: 'hours' | 'staff'): ChartData<'bar'> { const colors = readAcademicChartColors(); return { labels: rows.map(row => this.shortLabel(row.label)), datasets: [{ label, data: rows.map(row => metric === 'staff' ? row.staff : row.hours), fullLabels: rows.map(row => row.label), backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 5, maxBarThickness: 28 } as any] }; }
  private shortLabel(label: string): string { return label.length > 18 ? `${label.slice(0, 17)}…` : label; }
  private options(type: 'bar' | 'line' | 'doughnut', title: string, indexAxis: 'x' | 'y' = 'y'): ChartOptions<any> { const base = academicChartOptions<any>(this.theme, title); const colors = readAcademicChartColors(); return { ...base, indexAxis: type === 'bar' ? indexAxis : undefined, scales: type === 'doughnut' ? undefined : { x: { ticks: { color: colors.onSurfaceVariant, maxRotation: indexAxis === 'x' ? 0 : undefined, minRotation: indexAxis === 'x' ? 0 : undefined }, grid: { color: colors.outline } }, y: { beginAtZero: true, ticks: { color: colors.onSurfaceVariant }, grid: { color: colors.outline } } }, plugins: { ...base.plugins, tooltip: { ...base.plugins?.tooltip, callbacks: { label: (context: any) => { const fullLabel = context.dataset.fullLabels?.[context.dataIndex]; return `${context.dataset.label}: ${fullLabel ? `${fullLabel} — ` : ''}${context.raw ?? 0}`; } } } } }; }
}
