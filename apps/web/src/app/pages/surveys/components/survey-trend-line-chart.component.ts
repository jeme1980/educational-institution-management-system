import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import type { SurveyTrendRound } from '../models/survey.model';

@Component({
  selector: 'app-survey-trend-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  template: `<div class="survey-trend-chart"><canvas baseChart type="line" [data]="data()" [options]="options()" role="img" [attr.aria-label]="label()"></canvas></div>`,
  styles: [`:host { display: block; min-width: 0; } .survey-trend-chart { height: 22rem; max-width: 100%; } canvas { display: block; width: 100% !important; height: 100% !important; }`],
})
export class SurveyTrendLineChartComponent {
  readonly rounds = input.required<SurveyTrendRound[]>();
  readonly values = input.required<(number | null)[]>();
  readonly label = input.required<string>();
  private readonly theme = inject(AcademicChartThemeService);

  readonly data = computed<ChartData<'line'>>(() => {
    this.theme.revision();
    const color = readAcademicChartColors().primary;
    return {
      labels: this.rounds().map(round => round.nameAr),
      datasets: [{ label: this.label(), data: this.values(), borderColor: color, backgroundColor: color, tension: 0, spanGaps: false }],
    };
  });

  readonly options = computed<ChartOptions<'line'>>(() => {
    const base = academicChartOptions<'line'>(this.theme, this.label());
    const colors = readAcademicChartColors();
    const rounds = this.rounds();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            title: items => rounds[items[0]?.dataIndex ?? 0]?.nameAr ?? '',
            label: context => context.parsed.y === null ? '—' : `${context.parsed.y}%`,
          },
        },
      },
      scales: {
        x: { ticks: { color: colors.onSurfaceVariant, maxRotation: 0 }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: colors.onSurfaceVariant, callback: value => `${value}%` }, grid: { color: colors.outline } },
      },
    };
  });
}
