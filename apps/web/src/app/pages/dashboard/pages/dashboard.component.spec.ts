import { DASHBOARD_QUICK_ACTIONS, dashboardKpiValues, filterDashboardQuickActions, resolveDashboardViewState } from './dashboard.component';

describe('Dashboard quick actions', () => {
  it('shows only actions allowed by the authenticated school permissions', () => {
    const actions = filterDashboardQuickActions(DASHBOARD_QUICK_ACTIONS, ['students:read', 'exams:read']);

    expect(actions.map((action) => action.route)).toEqual(['/students', '/exams']);
  });

  it('does not expose an action when its destination permission is missing', () => {
    const actions = filterDashboardQuickActions(DASHBOARD_QUICK_ACTIONS, []);

    expect(actions).toEqual([]);
  });

  it('keeps loading and error states distinct from content', () => {
    expect(resolveDashboardViewState(null, false, '')).toBe('loading');
    expect(resolveDashboardViewState(null, true, 'request failed')).toBe('error');
    expect(resolveDashboardViewState({} as never, true, '')).toBe('content');
  });

  it('maps the API KPI values without replacing a missing response with zeros', () => {
    expect(dashboardKpiValues(null)).toBeNull();
    expect(dashboardKpiValues({ kpis: { activeStudents: 386, staffMembers: 24, classes: 18, guardians: 301 } } as never)).toEqual([386, 24, 18, 301]);
  });
});
