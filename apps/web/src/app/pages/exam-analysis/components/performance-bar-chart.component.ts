import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';

export interface PerformanceChartGroup {
  id: string;
  name: string;
  summary: { average: number; passRate: number };
}

export function performanceGroupBarData(groups: PerformanceChartGroup[]): ChartData<'bar'> {
  const colors = readAcademicChartColors();
  return {
    labels: groups.map(group => group.name),
    datasets: [{
      label: 'متوسط الأداء',
      data: groups.map(group => Number.isFinite(group.summary.average) ? group.summary.average : 0),
      backgroundColor: colors.primary,
      borderRadius: 6,
      maxBarThickness: 56,
    }],
  };
}

@Component({
  selector: 'app-performance-bar-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="performance-chart performance-bar-chart">
      <canvas baseChart type="bar" [data]="data()" [options]="options()" role="img" [attr.aria-label]="ariaLabel()"></canvas>
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .performance-chart { width: 100%; height: 16rem; }
    canvas { display: block; width: 100% !important; height: 100% !important; }
  `],
})
export class PerformanceBarChartComponent {
  readonly groups = input.required<PerformanceChartGroup[]>();
  readonly ariaLabel = input('مقارنة الشعب حسب متوسط الأداء ونسبة النجاح');
  private readonly theme = inject(AcademicChartThemeService);
  readonly data = computed(() => performanceGroupBarData(this.groups()));
  readonly options = computed(() => {
    const base = academicChartOptions<'bar'>(this.theme, this.ariaLabel());
    const colors = readAcademicChartColors();
    return ({
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: { label: (context: { dataIndex: number }) => {
          const group = this.groups()[context.dataIndex];
          return group ? [`متوسط الأداء: ${group.summary.average.toFixed(1)}%`, `نسبة النجاح: ${group.summary.passRate.toFixed(1)}%`] : '';
        } },
      },
    },
    scales: {
      x: { ticks: { color: colors.onSurfaceVariant }, grid: { display: false } },
      y: { beginAtZero: true, max: 100, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` }, grid: { color: colors.outline } },
    },
  });
  });
}
