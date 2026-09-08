import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { StaffDevelopmentComponent } from './staff-development.component';

const specializations = [
  { id: 'math', nameAr: 'رياضيات', isActive: true },
  { id: 'science', nameAr: 'علوم', isActive: true },
];
const staff = [
  { id: 'staff-1', firstNameAr: 'أحمد', familyNameAr: 'علي', specialization: specializations[0] },
  { id: 'staff-2', firstNameAr: 'سارة', familyNameAr: 'حسن', specialization: specializations[1] },
];
const periods = [
  { id: 'period-1', academicYearId: 'year-1', nameAr: 'الفصل الأول', startDate: '2026-09-01', endDate: '2026-12-31' },
  { id: 'period-2', academicYearId: 'year-2', nameAr: 'الفصل الثاني', startDate: '2027-01-01', endDate: '2027-06-30' },
];
const developments = [
  { id: 'development-1', institutionId: 'school', staffMemberId: 'staff-1', courseCode: 'MATH-1', courseName: 'رياضيات متقدمة', provider: { id: 'provider-1', providerCode: 'P1', name: 'المركز التربوي' }, startDate: '2026-10-01', endDate: '2026-10-20', staffMember: staff[0] },
  { id: 'development-2', institutionId: 'school', staffMemberId: 'staff-2', courseCode: 'SCI-1', courseName: 'مختبر العلوم', provider: { id: 'provider-1', providerCode: 'P1', name: 'المركز التربوي' }, startDate: '2027-02-01', endDate: '2027-02-20', staffMember: staff[1] },
];

describe('StaffDevelopmentComponent filters', () => {
  let fixture: ComponentFixture<StaffDevelopmentComponent>;
  let component: StaffDevelopmentComponent;
  const selectedAcademicYearId = signal<string | null>('year-1');

  beforeEach(async () => {
    selectedAcademicYearId.set('year-1');
    await TestBed.configureTestingModule({
      imports: [StaffDevelopmentComponent],
      providers: [
        {
          provide: ApiService,
          useValue: {
            staffDevelopments: signal(developments), staff: signal(staff), academicPeriods: signal(periods),
            publicLookups: signal({ specializations }), selectedAcademicYearId,
            institutions: signal([]), selectedInstitutionId: signal('school'),
            loadStaff: vi.fn(), loadStaffDevelopments: vi.fn(), loadInstitutions: vi.fn(),
            loadPublicLookups: vi.fn(), loadAcademicPeriods: vi.fn(),
          },
        },
        { provide: AuthService, useValue: { hasPermission: vi.fn(() => true) } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StaffDevelopmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the search without an icon and shows both new filters from real data', () => {
    const search = fixture.nativeElement.querySelector('.development-search');
    expect(search.querySelector('mat-icon')).toBeNull();
    expect(search.querySelector('input').placeholder).toBe('رمز الدورة أو اسمها أو الجهة أو الموظف');
    expect(fixture.nativeElement.textContent).toContain('كل الموظفين');
    expect(fixture.nativeElement.querySelector('[data-testid="specialization-filter"]').textContent).toContain('رياضيات');
    const periodFilter = fixture.nativeElement.querySelector('[data-testid="period-filter"]');
    expect(periodFilter.textContent).toContain('الفصل الأول');
    expect(periodFilter.textContent).not.toContain('الفصل الثاني');
  });

  it('composes text, employee, specialization, and period filters', () => {
    component.searchTerm.set('رياضيات');
    component.selectedStaffId.set('staff-1');
    component.selectedSpecializationId.set('math');
    component.selectedPeriodId.set('period-1');
    expect(component.filteredDevelopments().map(item => item.id)).toEqual(['development-1']);

    component.selectedSpecializationId.set('science');
    expect(component.filteredDevelopments()).toEqual([]);
  });

  it('uses ALL values to bypass specialization and period filtering', () => {
    component.selectedSpecializationId.set('ALL');
    component.selectedPeriodId.set('ALL');
    expect(component.filteredDevelopments()).toHaveLength(2);
  });

  it('updates period options for the global year and resets a stale selection', () => {
    component.selectedPeriodId.set('period-1');
    selectedAcademicYearId.set('year-2');
    fixture.detectChanges();

    expect(component.periodsForSelectedYear().map(period => period.id)).toEqual(['period-2']);
    expect(component.selectedPeriodId()).toBe('ALL');
    const periodFilter = fixture.nativeElement.querySelector('[data-testid="period-filter"]');
    expect(periodFilter.textContent).toContain('الفصل الثاني');
    expect(periodFilter.textContent).not.toContain('الفصل الأول');
  });

  it('introduces no pagination controls', () => {
    expect(fixture.nativeElement.querySelector('.pagination, [aria-label="ترقيم الصفحات"]')).toBeNull();
  });
});
