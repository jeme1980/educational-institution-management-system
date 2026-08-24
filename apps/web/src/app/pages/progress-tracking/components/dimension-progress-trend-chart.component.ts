import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { DimensionProgressPoint } from '../models/progress-tracking.model';

@Component({
  selector: 'app-dimension-progress-trend-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="progress-trend-chart"><canvas baseChart type="line" [data]="data()" [options]="options()" role="img" [attr.aria-label]="ariaLabel()"></canvas></div>`,
  styles: [`:host { display: block; min-width: 0; } .progress-trend-chart { height: 22rem; } canvas { display: block; width: 100% !important; height: 100% !important; }`],
})
export class DimensionProgressTrendChartComponent {
  readonly points = input.required<DimensionProgressPoint[]>();
  readonly dimensionName = input('');
  readonly ariaLabel = computed(() => `اتجاه إتقان ${this.dimensionName() || 'البعد'} عبر الامتحانات`);
  private readonly theme = inject(AcademicChartThemeService);
  readonly data = computed<ChartData<'line'>>(() => {
    const colors = readAcademicChartColors();
    const points = this.points();
    return { labels: points.map((point) => point.examName), datasets: [{ label: `إتقان ${this.dimensionName() || 'البعد'}`, data: points.map((point) => point.masteryRate), borderColor: colors.primary, backgroundColor: colors.primary, tension: 0.25, spanGaps: false }] };
  });
  readonly options = computed(() => {
    const base = academicChartOptions<'line'>(this.theme, this.ariaLabel());
    const colors = readAcademicChartColors();
    return { ...base, plugins: { ...base.plugins, legend: { display: true, rtl: true, textDirection: 'rtl', labels: { color: colors.onSurface } }, tooltip: { ...base.plugins?.tooltip, callbacks: { label: (context: any) => { const point = this.points()[context.dataIndex]; return point ? `الإتقان: ${point.masteryRate ?? 'غير متاح'}%` : ''; }, afterBody: (contexts: any[]) => { const point = this.points()[contexts[0]?.dataIndex]; return point ? [`${point.examDate}`, `الأسئلة: ${point.questionCount}`, `الحد الأقصى: ${point.maxPoints}`, `المشاركون: ${point.participantCount}`, `غير المجاب: ${point.unansweredRate == null ? 'غير متاح' : `${point.unansweredRate}%`}`] : []; } } } }, scales: { x: { ticks: { color: colors.onSurfaceVariant }, grid: { display: false } }, y: { min: 0, max: 100, ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` }, grid: { color: colors.outline } } } };
  });
}
