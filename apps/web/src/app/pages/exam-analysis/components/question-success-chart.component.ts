import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { QuestionAnalysis } from '../models/exam-analysis.model';

export function questionSuccessBarData(questions: QuestionAnalysis[]): ChartData<'bar'> {
  return {
    labels: questions.map(question => `س${question.questionNumber}`),
    datasets: [{
      label: 'نسبة النجاح',
      data: questions.map(question => Number.isFinite(question.successRate) ? question.successRate : 0),
      backgroundColor: questions.map(question => question.level.color),
      borderRadius: 6,
      maxBarThickness: 48,
    }],
  };
}

@Component({
  selector: 'app-question-success-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="question-success-chart" role="img" [attr.aria-label]="ariaLabel()">
      <canvas baseChart type="bar" [data]="data()" [options]="options()" role="img" [attr.aria-label]="ariaLabel()"></canvas>
      <p class="question-success-chart__summary">{{ summary() }}</p>
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .question-success-chart { width: 100%; height: clamp(13.75rem, 30vw, 20rem); }
    canvas { display: block; width: 100% !important; height: 100% !important; }
    .question-success-chart__summary { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { canvas { transition: none !important; } }
  `],
})
export class QuestionSuccessChartComponent {
  readonly questions = input.required<QuestionAnalysis[]>();
  readonly ariaLabel = input('مخطط نسبة النجاح لكل سؤال');
  private readonly theme = inject(AcademicChartThemeService);
  readonly data = computed(() => questionSuccessBarData(this.questions()));
  readonly summary = computed(() => this.questions().map(question => `س${question.questionNumber}: ${question.successRate.toFixed(1)}% — ${question.level.name}`).join('، '));
  readonly options = computed(() => {
    const base = academicChartOptions<'bar'>(this.theme, this.ariaLabel());
    const colors = readAcademicChartColors();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            title: (items: { dataIndex: number }[]) => {
              const question = this.questions()[items[0]?.dataIndex];
              return question ? `السؤال ${question.questionNumber}` : '';
            },
            label: (context: { dataIndex: number }) => {
              const question = this.questions()[context.dataIndex];
              return question ? [`نسبة النجاح: ${question.successRate.toFixed(1)}%`, `المستوى: ${question.level.name}`] : '';
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: colors.onSurfaceVariant }, grid: { display: false } },
        y: { beginAtZero: true, max: 100, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` }, grid: { color: colors.outline } },
      },
    };
  });
}
