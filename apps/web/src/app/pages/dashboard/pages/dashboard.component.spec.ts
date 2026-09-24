import { DASHBOARD_QUICK_ACTIONS, dashboardKpiValues, filterDashboardQuickActions, resolveDashboardViewState } from './dashboard.component';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardBarChartComponent } from '../components/dashboard-bar-chart.component';
import { DashboardRecentEnrollmentsComponent } from '../components/dashboard-recent-enrollments.component';

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

describe('Dashboard exam status card', () => {
  const render = async (skillPerformance: object[]) => {
    const stats = signal({
      academicYearLabel: '2025-2026',
      kpis: { activeStudents: 0, staffMembers: 0, classes: 0, guardians: 0 },
      examStatus: [{ id: 'completed', label: 'مكتملة', count: 30 }],
      skillPerformance,
    });
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]),
        { provide: ApiService, useValue: {
          stats, loadDashboardStats: async () => true, loadAcademicYears: async () => undefined,
          loadLookups: async () => undefined,
        } },
        { provide: AuthService, useValue: { currentContext: () => ({ permissions: [] }) } },
      ],
    });
    TestBed.overrideComponent(DashboardBarChartComponent, { set: { template: '' } });
    TestBed.overrideComponent(DashboardRecentEnrollmentsComponent, { set: { template: '' } });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return Array.from(root.querySelectorAll('article')).find(article => article.querySelector('h2')?.textContent === 'حالة الامتحانات')!;
  };

  it('renders completed count and backend-ranked skill/topic percentages with type badges and distinct rows', async () => {
    const card = await render([
      { id: 'same-id', label: 'Skill A', kind: 'skill', average: 76.61, count: 59 },
      { id: 'same-id', label: 'Topic A', kind: 'topic', average: 60, count: 2 },
      { id: 'zero', label: 'Skill zero', kind: 'skill', average: 0, count: 1 },
    ]);
    expect(card.querySelector('.status-cards strong')?.textContent).toBe('30');
    expect(card.querySelector('.status-cards span')?.textContent).toBe('مكتملة');
    expect(card.querySelector('h3')?.textContent).toBe('المهارات والمواضيع الأعلى أداءً');
    const rows = Array.from(card.querySelectorAll('.compact-row'));
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.querySelector('strong')?.textContent)).toEqual(['76.61%', '60%', '0%']);
    expect(rows.map(row => row.querySelector('ui-badge')?.textContent?.trim())).toEqual(['مهارة', 'موضوع', 'مهارة']);
    expect(rows[0].textContent).toContain('Skill A');
    expect(rows[1].textContent).toContain('Topic A');
  });

  it('shows the requested empty state without misleading zero metrics', async () => {
    const card = await render([]);
    expect(card.textContent).toContain('لا توجد بيانات كافية لتحليل المهارات والمواضيع.');
    expect(card.querySelectorAll('.compact-row')).toHaveLength(0);
  });

  it('shows only the first five backend-ranked dimensions', async () => {
    const card = await render(Array.from({ length: 7 }, (_, index) => ({
      id: String(index), label: `Skill ${index}`, kind: 'skill', average: 100 - index, count: 1,
    })));
    expect(card.querySelectorAll('.compact-row')).toHaveLength(5);
    expect(card.textContent).not.toContain('Skill 5');
  });
});
