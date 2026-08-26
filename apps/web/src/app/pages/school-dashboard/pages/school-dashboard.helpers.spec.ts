import { describe, expect, it } from 'vitest';
import { compactChartLabel, schoolDashboardKpiValues, selectCurrentAcademicYear, shouldShowGroupComparison } from './school-dashboard.helpers';

describe('School dashboard helpers', () => {
  it('selects the current academic year without falling back to an arbitrary year', () => {
    expect(selectCurrentAcademicYear([{ id: 'old' }, { id: 'current', isCurrent: true }])).toEqual({ id: 'current', isCurrent: true });
    expect(selectCurrentAcademicYear([{ id: 'old' }])).toBeUndefined();
  });
  it('hides group comparison when there is only one or no group', () => {
    expect(shouldShowGroupComparison(0)).toBe(false); expect(shouldShowGroupComparison(1)).toBe(false); expect(shouldShowGroupComparison(2)).toBe(true);
  });
  it('keeps zero data finite and renders a deliberate empty average', () => {
    expect(schoolDashboardKpiValues(null)).toEqual(['—', 0, 0, 0, 0]);
  });
  it('compacts only the chart display label while preserving a readable prefix', () => {
    expect(compactChartLabel('الصف التجريبي — الرياضيات', 16)).toHaveLength(16);
    expect(compactChartLabel('علوم')).toBe('علوم');
  });
});
