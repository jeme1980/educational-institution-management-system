import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { ProgressTrackingPoint } from '../models/progress-tracking.model';
import { formatProgressExamAxisLabel, progressTrendChartOptions } from './progress-trend-chart.options';

@Component({
  selector: 'app-progress-trend-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="progress-trend-chart"><canvas baseChart type="line" [data]="data()" [options]="options()" (chartClick)="onChartClick($event)" role="img" [attr.aria-label]="ariaLabel()"></canvas></div>`,
  styles: [`:host { display: block; min-width: 0; } .progress-trend-chart { height: 22rem; } canvas { display: block; width: 100% !important; height: 100% !important; }`],
})
export class ProgressTrendChartComponent {
  readonly points = input.required<ProgressTrackingPoint[]>();
  readonly ariaLabel = input('مسار متوسط الأداء ونسبة النجاح عبر الامتحانات');
  readonly examSelected = output<string>();
  private readonly theme = inject(AcademicChartThemeService);
  readonly data = computed<ChartData<'line'>>(() => {
    const colors = readAcademicChartColors();
    const points = this.points();
    return {
      labels: points.map((point) => formatProgressExamAxisLabel(point.examName)),
      datasets: [
        { label: 'متوسط الأداء', data: points.map((point) => point.averagePercentage), borderColor: colors.primary, backgroundColor: colors.primary, tension: 0.25, spanGaps: false },
        { label: 'نسبة النجاح', data: points.map((point) => point.passRate), borderColor: colors.success, backgroundColor: colors.success, tension: 0.25, spanGaps: false },
      ],
    };
  });
  readonly options = computed(() => {
    const base = progressTrendChartOptions(this.theme, this.ariaLabel(), this.points().map((point) => point.examName));
    const colors = readAcademicChartColors();
    return { ...base, plugins: { ...base.plugins, legend: { display: true, rtl: true, textDirection: 'rtl', labels: { color: colors.onSurface } }, tooltip: { ...base.plugins?.tooltip, callbacks: { ...base.plugins?.tooltip?.callbacks, label: (context: any) => { const point = this.points()[context.dataIndex]; if (!point) return ''; return context.datasetIndex === 0 ? `متوسط الأداء: ${point.averagePercentage ?? 'لا توجد بيانات'}%` : `نسبة النجاح: ${point.passRate ?? 'لا توجد بيانات'}%`; }, afterBody: (contexts: any[]) => { const point = this.points()[contexts[0]?.dataIndex]; return point ? [`${point.examDate}`, `المتقدمون: ${point.participantCount}`, `النوع: ${point.examType?.nameAr || 'غير محدد'}`] : []; } } } } };
  });
  onChartClick(event: any): void { const index = event?.active?.[0]?.index; const point = Number.isInteger(index) ? this.points()[index] : null; if (point) this.examSelected.emit(point.examId); }
}
