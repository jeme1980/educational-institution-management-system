import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';
import { StudentProgressPoint } from '../models/progress-tracking.model';
import { formatProgressExamAxisLabel, progressTrendChartOptions } from './progress-trend-chart.options';

@Component({
  selector: 'app-student-progress-trend-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="student-progress-trend-chart"><canvas baseChart type="line" [data]="data()" [options]="options()" role="img" [attr.aria-label]="ariaLabel()"></canvas></div>`,
  styles: [`:host { display: block; min-width: 0; } .student-progress-trend-chart { height: 22rem; } canvas { display: block; width: 100% !important; height: 100% !important; }`],
})
export class StudentProgressTrendChartComponent {
  readonly points = input.required<StudentProgressPoint[]>();
  readonly ariaLabel = input('مسار أداء الطالب ومتوسط الشعبة عبر الامتحانات');
  private readonly theme = inject(AcademicChartThemeService);

  readonly data = computed<ChartData<'line'>>(() => {
    const colors = readAcademicChartColors();
    const points = this.points();
    return {
      labels: points.map((point) => formatProgressExamAxisLabel(point.examName)),
      datasets: [
        { label: 'أداء الطالب', data: points.map((point) => point.studentPercentage), borderColor: colors.primary, backgroundColor: colors.primary, tension: 0.25, spanGaps: false },
        { label: 'متوسط الشعبة', data: points.map((point) => point.groupAveragePercentage), borderColor: colors.success, backgroundColor: colors.success, tension: 0.25, spanGaps: true },
      ],
    };
  });

  readonly options = computed(() => {
    const base = progressTrendChartOptions(this.theme, this.ariaLabel(), this.points().map((point) => point.examName));
    const colors = readAcademicChartColors();
    const statusLabels: Record<string, string> = { completed: 'مكتمل', absent: 'غائب', missing: 'لا توجد نتيجة' };
    return { ...base, plugins: { ...base.plugins, legend: { display: true, rtl: true, textDirection: 'rtl', labels: { color: colors.onSurface } }, tooltip: { ...base.plugins?.tooltip, callbacks: { ...base.plugins?.tooltip?.callbacks, label: (context: any) => { const point = this.points()[context.dataIndex]; if (!point) return ''; const value = context.datasetIndex === 0 ? point.studentPercentage : point.groupAveragePercentage; return `${context.dataset.label}: ${value == null ? 'لا توجد بيانات' : `${value}%`}`; }, afterBody: (contexts: any[]) => { const point = this.points()[contexts[0]?.dataIndex]; return point ? [`${point.examDate}`, `الحالة: ${statusLabels[point.participationStatus]}`, `الفجوة: ${point.gapFromGroup == null ? 'لا توجد بيانات' : `${point.gapFromGroup} نقطة`}`] : []; } } } } };
  });
}
