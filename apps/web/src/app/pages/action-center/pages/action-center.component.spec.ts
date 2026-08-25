import { describe, expect, it } from 'vitest';
import { actionTypeLabel, groupActionItems } from './action-center.helpers';

describe('ActionCenterComponent helpers', () => {
  it('groups items by the four workspace sections', () => {
    const item = (type: any, key: string) => ({ type, key });
    const groups = groupActionItems([item('STUDENT_DECLINE', 's'), item('CLASS_DECLINE', 'c'), item('DIMENSION_DECLINE', 'd'), item('INTERVENTION_NO_FOLLOWUP', 'i')] as any);
    expect(groups.students).toHaveLength(1); expect(groups.classes).toHaveLength(1); expect(groups.dimensions).toHaveLength(1); expect(groups.interventions).toHaveLength(1);
  });
  it('uses deterministic Arabic labels without claiming a general health state', () => { expect(actionTypeLabel('STUDENT_DECLINE')).toBe('تراجع طالب'); expect(actionTypeLabel('INTERVENTION_CRITERION_NOT_MET')).toContain('غير محقق'); });
});
