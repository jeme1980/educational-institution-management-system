import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { dateValueToUtcDay, StaffDevelopmentComponent } from './staff-development.component';

const specializations = [
  { id: 'math', nameAr: 'رياضيات', isActive: true },
  { id: 'science', nameAr: 'علوم', isActive: true },
];
const staff = [
  { id: 'staff-1', firstNameAr: 'أحمد', familyNameAr: 'علي', specialization: specializations[0] },
  { id: 'staff-2', firstNameAr: 'سارة', familyNameAr: 'حسن', specialization: specializations[1] },
];
const developments = [
  { id: 'development-1', institutionId: 'school', staffMemberId: 'staff-1', courseCode: 'MATH-1', courseName: 'رياضيات متقدمة', provider: { id: 'provider-1', providerCode: 'P1', name: 'المركز التربوي' }, startDate: '2025-11-27T00:00:00.000Z', endDate: '2026-04-23T00:00:00.000Z', staffMember: staff[0] },
  { id: 'development-2', institutionId: 'school', staffMemberId: 'staff-2', courseCode: 'SCI-1', courseName: 'مختبر العلوم', provider: { id: 'provider-1', providerCode: 'P1', name: 'المركز التربوي' }, startDate: '2027-02-01', endDate: '2027-02-20', staffMember: staff[1] },
];
const eventWithValue = (value: string) => ({ target: { value } } as unknown as Event);

describe('StaffDevelopmentComponent temporal filters', () => {
  let fixture: ComponentFixture<StaffDevelopmentComponent>;
  let component: StaffDevelopmentComponent;
  const loadAcademicPeriods = vi.fn();

  beforeEach(async () => {
    loadAcademicPeriods.mockReset();
    await TestBed.configureTestingModule({
      imports: [StaffDevelopmentComponent],
      providers: [
        {
          provide: ApiService,
          useValue: {
            staffDevelopments: signal(developments), staff: signal(staff),
            publicLookups: signal({ specializations }), institutions: signal([]), selectedInstitutionId: signal('school'),
            loadStaff: vi.fn(), loadStaffDevelopments: vi.fn(), loadInstitutions: vi.fn(), loadPublicLookups: vi.fn(),
            loadAcademicPeriods,
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

  it('replaces the AcademicPeriod filter with an independent temporal mode filter', () => {
    expect(fixture.nativeElement.textContent).not.toContain('الفترة الدراسية');
    expect(fixture.nativeElement.textContent).toContain('الفترة الزمنية');
    expect(fixture.nativeElement.querySelector('[data-testid="period-mode-filter"]').textContent).toContain('نطاق تاريخ مخصص');
    expect(loadAcademicPeriods).not.toHaveBeenCalled();
  });

  it('applies no date filtering in ALL mode', () => {
    expect(component.filteredDevelopments()).toHaveLength(2);
  });

  it('derives descending years from record ranges and renders the year selector', () => {
    component.updatePeriodMode(eventWithValue('YEAR'));
    fixture.detectChanges();
    expect(component.availableYears()).toEqual([2027, 2026, 2025]);
    expect(fixture.nativeElement.querySelector('[data-testid="year-filter"]')).not.toBeNull();
  });

  it('includes a record spanning two calendar years in both years', () => {
    component.periodMode.set('YEAR');
    component.selectedYear.set(2025);
    expect(component.filteredDevelopments().map(item => item.id)).toEqual(['development-1']);
    component.selectedYear.set(2026);
    expect(component.filteredDevelopments().map(item => item.id)).toEqual(['development-1']);
  });

  it('renders custom date inputs and uses inclusive overlap semantics', () => {
    component.updatePeriodMode(eventWithValue('CUSTOM'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[aria-label="من تاريخ"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[aria-label="إلى تاريخ"]')).not.toBeNull();
    component.fromDate.set('2026-01-01');
    component.toDate.set('2026-02-01');
    expect(component.filteredDevelopments().map(item => item.id)).toEqual(['development-1']);
  });

  it('supports from-only and to-only ranges', () => {
    component.periodMode.set('CUSTOM');
    component.fromDate.set('2026-01-01');
    expect(component.filteredDevelopments().map(item => item.id)).toEqual(['development-1', 'development-2']);
    component.fromDate.set('');
    component.toDate.set('2025-12-01');
    expect(component.filteredDevelopments().map(item => item.id)).toEqual(['development-1']);
  });

  it('shows Arabic validation and no results for an invalid range', () => {
    component.periodMode.set('CUSTOM');
    component.fromDate.set('2026-03-01');
    component.toDate.set('2026-02-01');
    fixture.detectChanges();
    expect(component.dateRangeError()).toBe('يجب أن يكون تاريخ البداية قبل تاريخ النهاية.');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(component.dateRangeError());
    expect(component.filteredDevelopments()).toEqual([]);
  });

  it('clears hidden temporal state whenever the mode changes', () => {
    component.periodMode.set('YEAR');
    component.selectedYear.set(2026);
    component.updatePeriodMode(eventWithValue('CUSTOM'));
    expect(component.selectedYear()).toBeNull();
    component.fromDate.set('2026-01-01');
    component.toDate.set('2026-02-01');
    component.updatePeriodMode(eventWithValue('YEAR'));
    expect(component.fromDate()).toBe('');
    expect(component.toDate()).toBe('');
    component.selectedYear.set(2025);
    component.updatePeriodMode(eventWithValue('ALL'));
    expect(component.selectedYear()).toBeNull();
    expect(component.fromDate()).toBe('');
    expect(component.toDate()).toBe('');
  });

  it('composes search, employee, specialization, and temporal filters', () => {
    component.searchTerm.set('رياضيات');
    component.selectedStaffId.set('staff-1');
    component.selectedSpecializationId.set('math');
    component.periodMode.set('YEAR');
    component.selectedYear.set(2026);
    expect(component.filteredDevelopments().map(item => item.id)).toEqual(['development-1']);
    component.selectedSpecializationId.set('science');
    expect(component.filteredDevelopments()).toEqual([]);
  });

  it('normalizes date-only and ISO values to the same UTC calendar day', () => {
    expect(dateValueToUtcDay('2026-01-01')).toBe(dateValueToUtcDay('2026-01-01T23:30:00-08:00'));
    expect(dateValueToUtcDay('2026-02-30')).toBeNull();
  });

  it('introduces no pagination controls', () => {
    expect(fixture.nativeElement.querySelector('.pagination, [aria-label="ترقيم الصفحات"]')).toBeNull();
  });
});
