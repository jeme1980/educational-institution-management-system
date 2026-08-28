import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { DashboardStats } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';

@Component({
  selector: 'app-dashboard-bar-chart',
  standalone: true,
  imports: [CommonModule, MatIconModule, BaseChartDirective],
  template: `
    <section class="dashboard-chart-card" dir="rtl">
      <div class="dashboard-chart-card__heading">
        <div>
          <p class="dashboard-chart-card__kicker">التوزيع الأكاديمي</p>
          <h2>توزيع الطلاب حسب المرحلة والطبقة</h2>
        </div>
        <span class="dashboard-chart-card__icon" aria-hidden="true"><mat-icon>bar_chart</mat-icon></span>
      </div>
      @if (sortedData.length) {
        <div class="dashboard-chart" role="img" aria-label="توزيع الطلاب حسب المرحلة والطبقة">
          <canvas baseChart type="bar" [data]="chartData" [options]="chartOptions"></canvas>
        </div>
      } @else {
        <div class="dashboard-chart__empty">لا توجد بيانات طلاب للعرض</div>
      }
      <p class="dashboard-chart-card__caption">المحور الرئيسي: عدد الطلاب</p>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .dashboard-chart-card { min-width: 0; padding: var(--space-5); border: 1px solid var(--outline-variant); border-radius: var(--radius-lg); background: var(--card-background); box-shadow: var(--shadow-sm); }
    .dashboard-chart-card__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
    .dashboard-chart-card__kicker { margin: 0 0 var(--space-1); color: var(--primary); font-size: var(--font-xs); font-weight: var(--font-semibold); }
    .dashboard-chart-card h2 { margin: 0; color: var(--on-surface); font-size: var(--font-md); font-weight: var(--font-bold); }
    .dashboard-chart-card__icon { display: grid; width: var(--space-9); height: var(--space-9); place-items: center; border-radius: var(--radius-md); background: var(--primary-container); color: var(--on-primary-container); font-size: var(--font-xs); }
    .dashboard-chart { position: relative; height: 18rem; min-width: 0; }
    .dashboard-chart__empty { display: grid; height: 18rem; place-items: center; color: var(--on-surface-variant); font-size: var(--font-sm); text-align: center; }
    .dashboard-chart-card__caption { margin: var(--space-3) 0 0; color: var(--on-surface-variant); font-size: var(--font-xs); text-align: center; }
    @media (max-width: 520px) { .dashboard-chart-card { padding: var(--space-4); }.dashboard-chart { height: 16rem; } }
    @media (prefers-reduced-motion: reduce) { .dashboard-chart-card *, .dashboard-chart-card *::before, .dashboard-chart-card *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }
  `],
})
export class DashboardBarChartComponent {
  private readonly apiService = inject(ApiService);
  private readonly theme = inject(AcademicChartThemeService);
  @Input() data: DashboardStats['studentsByGrade'] = [];

  get sortedData(): DashboardStats['studentsByGrade'] {
    return [...this.data].sort((a, b) => this.compareAcademicLabels(a, b));
  }

  get chartData(): ChartData<'bar'> {
    const colors = readAcademicChartColors();
    return {
      labels: this.sortedData.map(item => item.label),
      datasets: [{
        label: 'عدد الطلاب',
        data: this.sortedData.map(item => item.count),
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        borderRadius: 6,
        maxBarThickness: 46,
      }],
    };
  }

  get chartOptions(): ChartOptions<'bar'> {
    const base = academicChartOptions<'bar'>(this.theme, 'توزيع الطلاب حسب المرحلة والطبقة');
    const colors = readAcademicChartColors();
    return {
      ...base,
      scales: {
        x: {
          ticks: { color: colors.onSurfaceVariant, autoSkip: true, maxRotation: 0, minRotation: 0 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: colors.onSurfaceVariant, precision: 0 },
          grid: { color: colors.outline },
        },
      },
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            title: items => items[0]?.label || '',
            label: item => `عدد الطلاب: ${item.raw}`,
          },
        },
      },
    };
  }

  private compareAcademicLabels(a: DashboardStats['studentsByGrade'][number], b: DashboardStats['studentsByGrade'][number]): number {
    const codeOrder = this.codeNumber(a) - this.codeNumber(b);
    if (codeOrder !== 0) return codeOrder;
    return a.label.localeCompare(b.label, 'ar');
  }

  private codeNumber(item: DashboardStats['studentsByGrade'][number]): number {
    return this.apiService.gradeLevels().find(level => level.id === item.id)?.codeNumber ?? Number.MAX_SAFE_INTEGER;
  }
}
