import { GradeLevel, SkillItem, TopicItem } from '../../../core/models/api.models';

export type CurriculumStatusFilter = 'all' | 'active' | 'inactive';
export type CurriculumFilterItem = Pick<TopicItem | SkillItem, 'gradeLevelId' | 'nameAr' | 'nameHe' | 'isActive'>;

export interface CurriculumFilters {
  gradeLevelId: string;
  status: CurriculumStatusFilter;
  search: string;
}

export interface CurriculumGradeGroup<T extends CurriculumFilterItem> {
  grade: GradeLevel | null;
  gradeLevelId: string;
  items: T[];
}

export function filterCurriculumItems<T extends CurriculumFilterItem>(items: readonly T[], filters: CurriculumFilters): T[] {
  const term = filters.search.trim().toLocaleLowerCase();
  return items.filter(item => {
    const gradeMatches = filters.gradeLevelId === 'all' || item.gradeLevelId === filters.gradeLevelId;
    const statusMatches = filters.status === 'all'
      || (filters.status === 'active' && item.isActive)
      || (filters.status === 'inactive' && !item.isActive);
    const searchMatches = !term
      || item.nameAr.toLocaleLowerCase().includes(term)
      || (item.nameHe || '').toLocaleLowerCase().includes(term);
    return gradeMatches && statusMatches && searchMatches;
  });
}

export function groupCurriculumItemsByGrade<T extends CurriculumFilterItem>(
  items: readonly T[],
  grades: readonly GradeLevel[],
): CurriculumGradeGroup<T>[] {
  const orderedGrades = [...grades]
    .sort((a, b) => (a.sortOrder ?? a.codeNumber) - (b.sortOrder ?? b.codeNumber));
  const groups: CurriculumGradeGroup<T>[] = orderedGrades
    .map(grade => ({ grade, gradeLevelId: grade.id, items: items.filter(item => item.gradeLevelId === grade.id) }))
    .filter(group => group.items.length > 0);
  const knownIds = new Set(orderedGrades.map(grade => grade.id));
  const unclassified = items.filter(item => !knownIds.has(item.gradeLevelId));
  if (unclassified.length) groups.push({ grade: null, gradeLevelId: 'unknown', items: unclassified });
  return groups;
}
