import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';

export interface PerformanceChartLevel {
  id: string;
  name: string;
  color: string;
  count: number;
}

export function performanceDonutData(levels: PerformanceChartLevel[]): ChartData<'doughnut'> {
  const colors = readAcademicChartColors();
  return {
    labels: levels.map(level => level.name),
    datasets: [{ data: levels.map(level => level.count), backgroundColor: levels.map(level => level.color), borderWidth: 2, borderColor: colors.surface }],
  };
}

@Component({
  selector: 'app-performance-donut-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="performance-chart performance-donut-chart" [attr.aria-label]="ariaLabel()">
      <canvas baseChart type="doughnut" [data]="data()" [options]="options()" role="img" [attr.aria-label]="ariaLabel()"></canvas>
      <div class="performance-donut-chart__center" aria-hidden="true"><strong>{{ total() }}</strong><span>{{ centerLabel() }}</span></div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; max-width: 15rem; margin-inline: auto; }
    .performance-chart { position: relative; width: 100%; height: 15rem; }
    canvas { display: block; width: 100% !important; height: 100% !important; }
    .performance-donut-chart__center { position: absolute; inset: 50% auto auto 50%; display: grid; transform: translate(-50%, -50%); place-items: center; gap: var(--space-1); color: var(--on-surface); pointer-events: none; text-align: center; }
    .performance-donut-chart__center strong { font-size: var(--font-xl); line-height: 1; }
    .performance-donut-chart__center span { color: var(--on-surface-variant); font-size: var(--font-xs); }
  `],
})
export class PerformanceDonutChartComponent {
  readonly levels = input.required<PerformanceChartLevel[]>();
  readonly total = input(0);
  readonly centerLabel = input('طالب');
  readonly ariaLabel = input('توزيع مستويات الأداء حسب عدد الطلاب');
  private readonly theme = inject(AcademicChartThemeService);
  readonly data = computed(() => performanceDonutData(this.levels()));
  readonly options = computed(() => {
    const base = academicChartOptions<'doughnut'>(this.theme, this.ariaLabel());
    return ({
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: { label: (context: { label?: string; raw?: unknown; dataset: { data?: unknown[] } }) => {
          const values = (context.dataset.data || []) as (number | string | null)[];
          const total = values.reduce<number>((sum, value) => sum + Number(value || 0), 0);
          const count = Number(context.raw || 0);
          const percentage = total ? count / total * 100 : 0;
          return `${context.label || ''}: ${count} طالب (${percentage.toFixed(1)}%)`;
        } },
      },
    },
  });
  });
}
