import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { DimensionAnalysis } from '../models/exam-analysis.model';

export function topicOverviewBarData(topics: DimensionAnalysis[]): ChartData<'bar'> {
  return {
    labels: topics.map(topic => topic.name),
    datasets: [{
      label: 'نسبة الإتقان',
      data: topics.map(topic => Number.isFinite(topic.masteryRate) ? topic.masteryRate : 0),
      backgroundColor: topics.map(topic => topic.level.color),
      borderRadius: 6,
      maxBarThickness: 28,
    }],
  };
}

@Component({
  selector: 'app-topic-overview-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topic-overview-chart" role="img" [attr.aria-label]="ariaLabel()">
      <canvas baseChart type="bar" [data]="data()" [options]="options()" role="img" [attr.aria-label]="ariaLabel()"></canvas>
      <p class="topic-overview-chart__summary">{{ summary() }}</p>
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .topic-overview-chart { width: 100%; height: clamp(13.75rem, 34vw, 20rem); }
    canvas { display: block; width: 100% !important; height: 100% !important; }
    .topic-overview-chart__summary { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `],
})
export class TopicOverviewChartComponent {
  readonly topics = input.required<DimensionAnalysis[]>();
  readonly ariaLabel = input('مخطط إتقان الموضوعات');
  private readonly theme = inject(AcademicChartThemeService);
  readonly data = computed(() => topicOverviewBarData(this.topics()));
  readonly summary = computed(() => this.topics().map(topic => `${topic.name}: ${topic.masteryRate.toFixed(1)}% — ${topic.level.name}`).join('، '));
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
            title: (items: { dataIndex: number }[]) => this.topics()[items[0]?.dataIndex]?.name || '',
            label: (context: { dataIndex: number }) => {
              const topic = this.topics()[context.dataIndex];
              return topic ? [`الإتقان: ${topic.masteryRate.toFixed(1)}%`, `الأسئلة: ${topic.questionCount}`, `المستوى: ${topic.level.name}`] : '';
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
