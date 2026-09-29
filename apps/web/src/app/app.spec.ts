import {TestBed} from '@angular/core/testing';
import {App, SCHOOL_NAV_ITEMS, filterSchoolNavItems, resolveSelectedId} from './app';
import {routes} from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('exposes only permission-authorized school navigation items', () => {
    const visible = filterSchoolNavItems(SCHOOL_NAV_ITEMS, ['students:read', 'settings:read']);

    expect(visible.map((item) => item.path)).toEqual([
      '/dashboard', '/students', '/registered-students', '/classes', '/study-groups', '/subjects', '/academic-years', '/settings',
    ]);
    expect(visible.some((item) => item.path === '/platform')).toBe(false);
  });

  it('shows surveys only with read permission and guards the school route', () => {
    expect(filterSchoolNavItems(SCHOOL_NAV_ITEMS, []).some(item => item.path === '/surveys')).toBe(false);
    expect(filterSchoolNavItems(SCHOOL_NAV_ITEMS, ['surveys:read'])).toContainEqual(expect.objectContaining({ path: '/surveys', permission: 'surveys:read' }));
    const surveyRoute = routes.find(route => route.path === 'surveys');
    expect(surveyRoute?.data?.['requiredPermission']).toBe('surveys:read');
    expect(surveyRoute?.canActivate).toHaveLength(2);
  });

  it('keeps a single-institution identity stable and selects only a valid academic year', () => {
    const institutions = [{ id: 'institution-a' }];
    const years = [{ id: 'year-old', isCurrent: false }, { id: 'year-current', isCurrent: true }];

    expect(resolveSelectedId(institutions, 'institution-other')).toBe('institution-a');
    expect(resolveSelectedId(years, 'year-other', (year) => year.isCurrent)).toBe('year-current');
    expect(resolveSelectedId(years, 'year-old', (year) => year.isCurrent)).toBe('year-old');
  });

  it('keeps one canonical platform route with platform guard', () => {
    const platformRoutes = routes.filter((route) => route.path === 'platform');
    expect(platformRoutes.length).toBe(1);
    expect(platformRoutes[0].children).toBeDefined();
    expect(platformRoutes[0].canActivate?.length).toBe(2);
  });
});
