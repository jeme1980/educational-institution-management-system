import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../../core/services/api.service';
import { StaffDevelopment } from '../../../core/models/api.models';
import { AcademicYear } from '../../academic-years/models/academic-year.model';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';

type Aggregate = { label: string; code?: string; hours: number; records: number; staff: number };

@Component({
  selector: 'app-staff-development-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, BaseChartDirective, UiPageHeaderComponent, UiFilterPanelComponent, UiSelectComponent, UiStatCardComponent],
  templateUrl: './staff-development-analysis.component.html',
  styleUrl: './staff-development-analysis.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffDevelopmentAnalysisComponent implements OnInit {
  readonly api = inject(ApiService);
  private readonly theme = inject(AcademicChartThemeService);
  readonly selectedYearId = signal('ALL');
  readonly selectedSpecializationId = signal('ALL');
  readonly selectedStaffId = signal('ALL');
  readonly selectedProviderId = signal('ALL');
  readonly selectedCompletion = signal('ALL');

  readonly years = computed(() => this.api.academicYears());
  readonly specializations = computed(() => (this.api.publicLookups()['specializations'] || []).filter((item: any) => item.isActive !== false));
  readonly providers = computed(() => (this.api.publicLookups()['providers'] || []).filter((item: any) => item.isActive !== false));
  readonly completions = computed(() => this.uniqueCompletions(this.api.staffDevelopments()));

  readonly filteredRecords = computed(() => this.api.staffDevelopments().filter(item => {
    const year = this.years().find(value => value.id === this.selectedYearId());
    const staff = item.staffMember;
    const inYear = !year || this.selectedYearId() === 'ALL' || this.overlapsYear(item, year);
    const inSpecialization = this.selectedSpecializationId() === 'ALL' || staff?.specialization?.id === this.selectedSpecializationId();
    const inStaff = this.selectedStaffId() === 'ALL' || item.staffMemberId === this.selectedStaffId();
    const inProvider = this.selectedProviderId() === 'ALL' || item.providerId === this.selectedProviderId();
    const inCompletion = this.selectedCompletion() === 'ALL' || item.courseCode === this.selectedCompletion();
    return inYear && inSpecialization && inStaff && inProvider && inCompletion;
  }));

  readonly participatingStaff = computed(() => new Set(this.filteredRecords().map(item => item.staffMemberId)).size);
  readonly totalRecords = computed(() => this.filteredRecords().length);
  readonly totalHours = computed(() => this.filteredRecords().reduce((sum, item) => sum + (item.hoursCount ?? 0), 0));
  readonly averageHours = computed(() => this.participatingStaff() ? this.totalHours() / this.participatingStaff() : 0);
  readonly averageHoursLabel = computed(() => this.averageHours().toFixed(1));
  readonly distinctProviders = computed(() => new Set(this.filteredRecords().map(item => item.providerId).filter(Boolean)).size);
  readonly distinctCompletions = computed(() => new Set(this.filteredRecords().map(item => item.courseCode)).size);
  readonly hasData = computed(() => this.filteredRecords().length > 0);

  readonly specialtyAggregates = computed(() => this.aggregate(this.filteredRecords(), item => item.staffMember?.specialization?.nameAr || 'بدون تخصص'));
  readonly providerAggregates = computed(() => this.aggregate(this.filteredRecords(), item => item.provider?.name || 'بدون جهة مقدمة'));
  readonly completionAggregates = computed(() => this.aggregate(this.filteredRecords(), item => item.courseName || item.courseCode, item => item.courseCode));
  readonly yearlyAggregates = computed(() => [...this.aggregate(this.filteredRecords(), item => this.yearOf(item.startDate))].sort((a, b) => {
    const yearA = Number(a.label);
    const yearB = Number(b.label);
    if (!Number.isFinite(yearA)) return 1;
    if (!Number.isFinite(yearB)) return -1;
    return yearA - yearB;
  }));
  readonly teacherRows = computed(() => this.teacherSummary(this.filteredRecords()));
  readonly uncoveredStaff = computed(() => Math.max(0, this.api.staff().filter(staff => !staff.archivedAt).length - this.participatingStaff()));

  readonly yearlyChartData = computed<ChartData<'line'>>(() => {
    const colors = readAcademicChartColors();
    const rows = this.yearlyAggregates();
    return { labels: rows.map(row => row.label), datasets: [{ label: 'إجمالي الساعات', data: rows.map(row => row.hours), borderColor: colors.primary, backgroundColor: colors.primary, tension: 0.25, fill: false }] };
  });
  readonly specialtyChartData = computed(() => this.horizontalData(this.specialtyAggregates(), 'إجمالي الساعات', 'hours'));
  readonly providerChartData = computed(() => this.horizontalData(this.providerAggregates(), 'إجمالي الساعات', 'hours'));
  readonly completionParticipationData = computed(() => this.horizontalData([...this.completionAggregates()].sort((a, b) => b.staff - a.staff || b.hours - a.hours), 'عدد الموظفين', 'staff'));
  readonly completionHoursData = computed(() => this.horizontalData(this.completionAggregates(), 'إجمالي الساعات', 'hours'));
  readonly coverageChartData = computed<ChartData<'doughnut'>>(() => ({ labels: ['لديهم سجل', 'دون سجل'], datasets: [{ data: [this.participatingStaff(), this.uncoveredStaff()], backgroundColor: [readAcademicChartColors().success, readAcademicChartColors().outline], borderColor: readAcademicChartColors().surface, borderWidth: 2 }] }));

  readonly lineOptions = computed(() => this.options('line', 'اتجاه ساعات التطوير عبر السنوات'));
  readonly barOptions = computed(() => this.options('bar', 'تحليل ساعات التطوير'));
  readonly doughnutOptions = computed(() => this.options('doughnut', 'تغطية الكادر بالتطوير المهني'));

  async ngOnInit(): Promise<void> {
    await Promise.all([this.api.loadStaff(), this.api.loadStaffDevelopments(), this.api.loadPublicLookups(), this.api.loadAcademicYears()]);
  }

  resetFilters(): void {
    this.selectedYearId.set('ALL'); this.selectedSpecializationId.set('ALL'); this.selectedStaffId.set('ALL'); this.selectedProviderId.set('ALL'); this.selectedCompletion.set('ALL');
  }

  private overlapsYear(item: StaffDevelopment, year: AcademicYear): boolean {
    const start = new Date(item.startDate).getTime(); const end = new Date(item.endDate).getTime();
    return start <= new Date(year.endDate).getTime() && end >= new Date(year.startDate).getTime();
  }

  private yearOf(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'غير محدد' : String(date.getUTCFullYear()); }
  private aggregate(records: StaffDevelopment[], labelOf: (item: StaffDevelopment) => string, codeOf?: (item: StaffDevelopment) => string): Aggregate[] {
    const map = new Map<string, Aggregate & { staffIds: Set<string> }>();
    for (const item of records) {
      const label = labelOf(item); const key = codeOf?.(item) || label; const row = map.get(key) || { label, code: codeOf?.(item), hours: 0, records: 0, staff: 0, staffIds: new Set<string>() };
      row.hours += item.hoursCount ?? 0; row.records++; row.staffIds.add(item.staffMemberId); row.staff = row.staffIds.size; map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours || b.staff - a.staff).map(({ staffIds, ...row }) => row);
  }
  private uniqueCompletions(records: StaffDevelopment[]): Array<{ code: string; label: string }> { const map = new Map<string, string>(); records.forEach(item => map.set(item.courseCode, item.courseName)); return [...map].map(([code, label]) => ({ code, label })); }
  private teacherSummary(records: StaffDevelopment[]) {
    const map = new Map<string, { staff: StaffDevelopment['staffMember']; records: number; hours: number; latest: StaffDevelopment }>();
    records.forEach(item => { const current = map.get(item.staffMemberId); if (!current || item.startDate > current.latest.startDate) map.set(item.staffMemberId, { staff: item.staffMember, records: (current?.records || 0) + 1, hours: (current?.hours || 0) + (item.hoursCount ?? 0), latest: item }); else { current.records++; current.hours += item.hoursCount ?? 0; } });
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }
  private horizontalData(rows: Aggregate[], label: string, metric: 'hours' | 'staff'): ChartData<'bar'> { const colors = readAcademicChartColors(); return { labels: rows.map(row => row.label), datasets: [{ label, data: rows.map(row => metric === 'staff' ? row.staff : row.hours), backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 5, maxBarThickness: 28 }] }; }
  private options(type: 'bar' | 'line' | 'doughnut', title: string): ChartOptions<any> { const base = academicChartOptions<any>(this.theme, title); const colors = readAcademicChartColors(); return { ...base, indexAxis: type === 'bar' ? 'y' : undefined, scales: type === 'doughnut' ? undefined : { x: { ticks: { color: colors.onSurfaceVariant }, grid: { color: colors.outline } }, y: { beginAtZero: true, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => type === 'line' ? `${value}` : `${value}` }, grid: { color: colors.outline } } }, plugins: { ...base.plugins, tooltip: { ...base.plugins?.tooltip, callbacks: { label: (context: any) => `${context.dataset.label}: ${context.raw ?? 0}` } } } }; }
}
