import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { DimensionAnalysis } from '../models/exam-analysis.model';

export function skillOverviewBarData(skills: DimensionAnalysis[]): ChartData<'bar'> {
  return {
    labels: skills.map(skill => skill.name),
    datasets: [{
      label: 'نسبة الإتقان',
      data: skills.map(skill => Number.isFinite(skill.masteryRate) ? skill.masteryRate : 0),
      backgroundColor: skills.map(skill => skill.level.color),
      borderRadius: 6,
      maxBarThickness: 28,
    }],
  };
}

@Component({
  selector: 'app-skill-overview-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skill-overview-chart" role="img" [attr.aria-label]="ariaLabel()">
      <canvas baseChart type="bar" [data]="data()" [options]="options()" role="img" [attr.aria-label]="ariaLabel()"></canvas>
      <p class="skill-overview-chart__summary">{{ summary() }}</p>
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .skill-overview-chart { width: 100%; height: clamp(13.75rem, 34vw, 20rem); }
    canvas { display: block; width: 100% !important; height: 100% !important; }
    .skill-overview-chart__summary { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `],
})
export class SkillOverviewChartComponent {
  readonly skills = input.required<DimensionAnalysis[]>();
  readonly ariaLabel = input('مخطط إتقان المهارات');
  private readonly theme = inject(AcademicChartThemeService);
  readonly data = computed(() => skillOverviewBarData(this.skills()));
  readonly summary = computed(() => this.skills().map(skill => `${skill.name}: ${skill.masteryRate.toFixed(1)}% — ${skill.level.name}`).join('، '));
  readonly options = computed(() => {
    const base = academicChartOptions<'bar'>(this.theme, this.ariaLabel());
    const colors = readAcademicChartColors();
    return {
      ...base,
      indexAxis: 'y' as const,
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            title: (items: { dataIndex: number }[]) => this.skills()[items[0]?.dataIndex]?.name || '',
            label: (context: { dataIndex: number }) => {
              const skill = this.skills()[context.dataIndex];
              return skill ? [`الإتقان: ${skill.masteryRate.toFixed(1)}%`, `الأسئلة: ${skill.questionCount}`, `المستوى: ${skill.level.name}`] : '';
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` }, grid: { color: colors.outline } },
        y: { ticks: { color: colors.onSurface }, grid: { display: false } },
      },
    };
  });
}
