import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { ProgressTrackingPoint } from '../models/progress-tracking.model';

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
      labels: points.map((point) => point.examName),
      datasets: [
        { label: 'متوسط الأداء', data: points.map((point) => point.averagePercentage), borderColor: colors.primary, backgroundColor: colors.primary, tension: 0.25, spanGaps: false },
        { label: 'نسبة النجاح', data: points.map((point) => point.passRate), borderColor: colors.success, backgroundColor: colors.success, tension: 0.25, spanGaps: false },
      ],
    };
  });
  readonly options = computed(() => {
    const base = academicChartOptions<'line'>(this.theme, this.ariaLabel());
    const colors = readAcademicChartColors();
    return { ...base, plugins: { ...base.plugins, legend: { display: true, rtl: true, textDirection: 'rtl', labels: { color: colors.onSurface } }, tooltip: { ...base.plugins?.tooltip, callbacks: { label: (context: any) => { const point = this.points()[context.dataIndex]; if (!point) return ''; return context.datasetIndex === 0 ? `متوسط الأداء: ${point.averagePercentage ?? 'لا توجد بيانات'}%` : `نسبة النجاح: ${point.passRate ?? 'لا توجد بيانات'}%`; }, afterBody: (contexts: any[]) => { const point = this.points()[contexts[0]?.dataIndex]; return point ? [`${point.examDate}`, `المتقدمون: ${point.participantCount}`, `النوع: ${point.examType?.nameAr || 'غير محدد'}`] : []; } } } }, scales: { x: { ticks: { color: colors.onSurfaceVariant }, grid: { display: false } }, y: { min: 0, max: 100, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` }, grid: { color: colors.outline } } } };
  });
  onChartClick(event: any): void { const index = event?.active?.[0]?.index; const point = Number.isInteger(index) ? this.points()[index] : null; if (point) this.examSelected.emit(point.examId); }
}
