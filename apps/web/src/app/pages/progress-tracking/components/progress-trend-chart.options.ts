import { ChartOptions } from 'chart.js';
import { academicChartOptions, readAcademicChartColors } from '../../../shared/charts/academic-chart-theme';
import { AcademicChartThemeService } from '../../../shared/charts/academic-chart-theme.service';

export function formatProgressExamAxisLabel(name: string, maxLength = 18): string {
  if (name.length <= maxLength) return name;
  return `${name.slice(0, maxLength - 1)}…`;
}

export function progressTrendChartOptions(
  theme: AcademicChartThemeService,
  title: string,
  examNames: readonly string[],
): ChartOptions<'line'> {
  const base = academicChartOptions<'line'>(theme, title);
  const colors = readAcademicChartColors();
  return {
    ...base,
    layout: { padding: { left: 12, right: 12, top: 8, bottom: 8 } },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          title: (items) => examNames[items[0]?.dataIndex ?? 0] || '',
        },
      },
    },
    scales: {
      x: {
        offset: true,
        ticks: {
          color: colors.onSurfaceVariant,
          autoSkip: true,
          maxTicksLimit: 6,
          maxRotation: 0,
          minRotation: 0,
          callback: (_value, index) => formatProgressExamAxisLabel(examNames[Number(index)] || ''),
        },
        grid: { display: false },
      },
      y: {
        min: 0,
        max: 100,
        ticks: { color: colors.onSurfaceVariant, callback: (value: string | number) => `${value}%` },
        grid: { color: colors.outline },
      },
    },
  };
}
