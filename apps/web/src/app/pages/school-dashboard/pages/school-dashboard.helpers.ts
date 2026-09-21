import type { SchoolDashboardData } from './school-dashboard.component';

const ALL = 'ALL';

export function selectedDashboardIds(ids: readonly string[]): string[] {
  return ids.includes(ALL) ? [] : ids.filter((id) => id !== ALL);
}

export function pruneDashboardSelection(selected: readonly string[], validIds: readonly string[]): string[] {
  if (selected.includes(ALL)) return [ALL];
  const valid = new Set(validIds);
  const pruned = selected.filter((id) => valid.has(id));
  return pruned.length ? pruned : [ALL];
}

export function schoolDashboardKpiValues(data: SchoolDashboardData | null): (number | string)[] {
  const summary = data?.summary;
  return [summary?.schoolAverage == null ? '—' : `${summary.schoolAverage}%`, summary?.examCount || 0, summary?.participatingStudentCount || 0, summary?.subjectCount || 0, summary?.studyGroupCount || 0];
}

export function shouldShowGroupComparison(groupCount: number): boolean { return groupCount >= 2; }

export function compactChartLabel(label: string, maxLength = 16): string { return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label; }

export function selectCurrentAcademicYear<T extends { id: string; isCurrent?: boolean }>(years: readonly T[]): T | undefined { return years.find(year => year.isCurrent); }

export interface DashboardComparisonEntity {
  key: string;
  id: string;
  kind: 'class' | 'grade';
  label: string;
}

interface ComparisonClass { id: string; nameAr: string; gradeLevelId: string; gradeLevelName: string; yearLabel: string }
interface ComparisonGrade { id: string; nameAr: string; sortOrder: number }

export function buildDashboardComparisonEntities(selectedClassIds: readonly string[], classes: readonly ComparisonClass[], grades: readonly ComparisonGrade[]): DashboardComparisonEntity[] {
  const selected = new Set(selectedDashboardIds(selectedClassIds));
  const orderedGrades = [...grades].sort((left, right) => left.sortOrder - right.sortOrder || left.nameAr.localeCompare(right.nameAr, 'ar'));
  if (!selected.size) return orderedGrades.map((grade) => ({ key: `grade:${grade.id}`, id: grade.id, kind: 'grade', label: grade.nameAr }));

  const selectedClasses = classes.filter((item) => selected.has(item.id));
  const classYears = new Map<string, Set<string>>();
  for (const item of selectedClasses) classYears.set(item.id, (classYears.get(item.id) || new Set()).add(item.yearLabel));
  const gradeIds = new Set(selectedClasses.map((item) => item.gradeLevelId));
  const entities: DashboardComparisonEntity[] = [];
  for (const grade of orderedGrades.filter((item) => gradeIds.has(item.id))) {
    for (const item of selectedClasses.filter((row) => row.gradeLevelId === grade.id).sort((left, right) => left.nameAr.localeCompare(right.nameAr, 'ar') || left.yearLabel.localeCompare(right.yearLabel))) {
      const repeatedAcrossYears = (classYears.get(item.id)?.size || 0) > 1;
      entities.push({ key: `class:${item.id}:${item.yearLabel}`, id: item.id, kind: 'class', label: repeatedAcrossYears ? `${item.nameAr} · ${item.yearLabel}` : item.nameAr });
    }
    entities.push({ key: `grade:${grade.id}`, id: grade.id, kind: 'grade', label: `متوسط ${grade.nameAr}` });
  }
  return entities;
}

export function sortDashboardExamTrend<T extends { examDate: string; examId: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.examDate.localeCompare(right.examDate) || left.examId.localeCompare(right.examId));
}
