import { ChartOptions } from 'chart.js';
import { AcademicChartThemeService } from './academic-chart-theme.service';

export interface AcademicChartColors {
  primary: string;
  onSurface: string;
  onSurfaceVariant: string;
  surface: string;
  outline: string;
  success: string;
  warning: string;
  danger: string;
}

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function readAcademicChartColors(): AcademicChartColors {
  return {
    primary: token('--primary', 'var(--primary)'),
    onSurface: token('--on-surface', 'var(--on-surface)'),
    onSurfaceVariant: token('--on-surface-variant', 'var(--on-surface-variant)'),
    surface: token('--surface-container-lowest', 'var(--surface-container-lowest)'),
    outline: token('--outline-variant', 'var(--outline-variant)'),
    success: token('--success', 'var(--success)'),
    warning: token('--warning', 'var(--warning)'),
    danger: token('--danger', 'var(--danger)'),
  };
}

export function academicChartOptions<TType extends 'bar' | 'doughnut'>(
  theme: AcademicChartThemeService,
  title: string,
): ChartOptions<TType> {
  theme.revision();
  const colors = readAcademicChartColors();
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : { duration: 300 },
    plugins: {
      legend: { display: false, rtl: true, textDirection: 'rtl', labels: { color: colors.onSurface } },
      title: { display: false, text: title, color: colors.onSurface },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        backgroundColor: colors.surface,
        titleColor: colors.onSurface,
        bodyColor: colors.onSurface,
        borderColor: colors.outline,
        borderWidth: 1,
        displayColors: true,
      },
    },
    scales: undefined,
  } as ChartOptions<TType>;
}
