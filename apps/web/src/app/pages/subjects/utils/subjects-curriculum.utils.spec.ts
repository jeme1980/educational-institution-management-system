import { describe, expect, it } from 'vitest';
import { filterCurriculumItems, filterSubjectRegistry, groupCurriculumItemsByGrade } from './subjects-curriculum.utils';

const items = [
  { id: 'topic-a', gradeLevelId: 'grade-a', nameAr: 'الكسور', nameHe: 'שברים', isActive: true },
  { id: 'topic-b', gradeLevelId: 'grade-b', nameAr: 'الهندسة', nameHe: null, isActive: false },
  { id: 'topic-c', gradeLevelId: 'grade-a', nameAr: 'الجبر', nameHe: null, isActive: false },
];

describe('subjects curriculum filters', () => {
  it('uses all grades as the explicit default sentinel', () => {
    expect(filterCurriculumItems(items, { gradeLevelId: 'all', status: 'all', search: '' })).toHaveLength(3);
  });

  it('filters topics and skills by the exact gradeLevelId', () => {
    expect(filterCurriculumItems(items, { gradeLevelId: 'grade-a', status: 'all', search: '' }).map(item => item.id))
      .toEqual(['topic-a', 'topic-c']);
  });

  it('does not treat another grade option as all', () => {
    expect(filterCurriculumItems(items, { gradeLevelId: 'grade-b', status: 'all', search: '' }).map(item => item.id))
      .toEqual(['topic-b']);
  });

  it('searches Arabic and Hebrew names without searching IDs', () => {
    expect(filterCurriculumItems(items, { gradeLevelId: 'all', status: 'all', search: 'كسور' }).map(item => item.id)).toEqual(['topic-a']);
    expect(filterCurriculumItems(items, { gradeLevelId: 'all', status: 'all', search: 'שברים' }).map(item => item.id)).toEqual(['topic-a']);
    expect(filterCurriculumItems(items, { gradeLevelId: 'all', status: 'all', search: 'topic-a' })).toEqual([]);
  });

  it('filters active and inactive records', () => {
    expect(filterCurriculumItems(items, { gradeLevelId: 'all', status: 'active', search: '' }).map(item => item.id)).toEqual(['topic-a']);
    expect(filterCurriculumItems(items, { gradeLevelId: 'all', status: 'inactive', search: '' }).map(item => item.id)).toEqual(['topic-b', 'topic-c']);
  });

  it('composes grade, status, and search with AND', () => {
    expect(filterCurriculumItems(items, { gradeLevelId: 'grade-a', status: 'inactive', search: 'جبر' }).map(item => item.id)).toEqual(['topic-c']);
    expect(filterCurriculumItems(items, { gradeLevelId: 'grade-b', status: 'active', search: 'هندسة' })).toEqual([]);
  });

  it('groups all grades by GradeLevel.sortOrder, not by the Arabic label', () => {
    const grades = [
      { id: 'grade-b', nameAr: 'أ', codeNumber: 2, sortOrder: 2 },
      { id: 'grade-a', nameAr: 'ي', codeNumber: 1, sortOrder: 1 },
    ];
    expect(groupCurriculumItemsByGrade(items, grades).map(group => group.gradeLevelId)).toEqual(['grade-a', 'grade-b']);
  });

  it('keeps a selected grade list limited to that grade before grouping', () => {
    const selected = filterCurriculumItems(items, { gradeLevelId: 'grade-b', status: 'all', search: '' });
    expect(selected.every(item => item.gradeLevelId === 'grade-b')).toBe(true);
  });
});

describe('subject registry filters', () => {
  const subjects = [
    { id: 'math', academicYearId: 'year-1', nameAr: 'الرياضيات', nameHe: 'מתמטיקה', isActive: true, archivedAt: null },
    { id: 'science', academicYearId: 'year-1', nameAr: 'العلوم', nameHe: 'מדעים', isActive: false, archivedAt: null },
    { id: 'old', academicYearId: 'year-2', nameAr: 'مادة قديمة', nameHe: null, isActive: true, archivedAt: '2025-01-01' },
  ];

  it('searches subject Arabic and Hebrew names', () => {
    expect(filterSubjectRegistry(subjects, { academicYearId: 'year-1', status: 'all', search: 'رياض' }).map(item => item.id)).toEqual(['math']);
    expect(filterSubjectRegistry(subjects, { academicYearId: 'year-1', status: 'all', search: 'מדעים' }).map(item => item.id)).toEqual(['science']);
  });

  it('composes status and academic-year filters and excludes archived subjects', () => {
    expect(filterSubjectRegistry(subjects, { academicYearId: 'year-1', status: 'active', search: '' }).map(item => item.id)).toEqual(['math']);
    expect(filterSubjectRegistry(subjects, { academicYearId: '', status: 'all', search: '' }).map(item => item.id)).toEqual(['math', 'science']);
  });

  it('returns an empty registry for an unmatched search', () => {
    expect(filterSubjectRegistry(subjects, { academicYearId: 'year-1', status: 'all', search: 'لغة' })).toEqual([]);
  });
});
