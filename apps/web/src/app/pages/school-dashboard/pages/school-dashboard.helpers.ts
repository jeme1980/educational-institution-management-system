import type { SchoolDashboardData } from './school-dashboard.component';

export function schoolDashboardKpiValues(data: SchoolDashboardData | null): Array<number | string> {
  const summary = data?.summary;
  return [summary?.schoolAverage == null ? '—' : `${summary.schoolAverage}%`, summary?.examCount || 0, summary?.participatingStudentCount || 0, summary?.subjectCount || 0, summary?.studyGroupCount || 0];
}

export function shouldShowGroupComparison(groupCount: number): boolean { return groupCount >= 2; }

export function compactChartLabel(label: string, maxLength = 16): string { return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label; }

export function selectCurrentAcademicYear<T extends { id: string; isCurrent?: boolean }>(years: readonly T[]): T | undefined { return years.find(year => year.isCurrent); }
