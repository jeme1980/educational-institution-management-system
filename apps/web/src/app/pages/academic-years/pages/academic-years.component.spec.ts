import { signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiService, AcademicPeriod, AcademicYear } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { AcademicYearsComponent } from './academic-years.component';

const openYear: AcademicYear = { id: 'open', institutionId: 'school', yearLabel: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', isCurrent: false, isClosed: false };
const createdPeriod: AcademicPeriod = { id: 'period-1', institutionId: 'school', academicYearId: openYear.id, nameAr: 'فصل 01', nameHe: null, startDate: '2026-09-01', endDate: '2026-12-31', sortOrder: 1, isActive: true };

describe('AcademicYearsComponent state actions', () => {
  const years = signal<AcademicYear[]>([openYear]);
  const periods = signal<AcademicPeriod[]>([]);
  const updateAcademicYear = vi.fn();
  const createAcademicPeriod = vi.fn();
  const loadAcademicPeriods = vi.fn();
  const closeAcademicYear = vi.fn();
  const setCurrentAcademicYear = vi.fn();
  const confirm = vi.fn();
  let component: AcademicYearsComponent;

  beforeEach(() => {
    years.set([openYear]); periods.set([]); updateAcademicYear.mockReset(); createAcademicPeriod.mockReset(); loadAcademicPeriods.mockReset(); closeAcademicYear.mockReset(); setCurrentAcademicYear.mockReset(); confirm.mockReset();
    TestBed.configureTestingModule({ providers: [FormBuilder,
      { provide: ApiService, useValue: { academicYears: years, academicPeriods: periods, updateAcademicYear, createAcademicPeriod, closeAcademicYear, setCurrentAcademicYear, loadAcademicYears: vi.fn(), loadAcademicPeriods, createAcademicYear: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ConfirmDialogService, useValue: { confirm } },
    ] });
    component = TestBed.runInInjectionContext(() => new AcademicYearsComponent()); component.initForms();
  });

  it('sends metadata only through the generic update', async () => {
    component.editingYear.set(openYear); component.yearForm.setValue({ yearLabel: openYear.yearLabel, startDate: openYear.startDate, endDate: openYear.endDate });
    updateAcademicYear.mockResolvedValue({ success: true }); await component.saveYear();
    expect(updateAcademicYear).toHaveBeenCalledWith(openYear.id, { yearLabel: openYear.yearLabel, startDate: openYear.startDate, endDate: openYear.endDate });
  });

  it('exposes state actions only for an open non-current non-archived year', () => {
    expect(component.canCloseYear(openYear)).toBe(true); expect(component.canSetCurrent(openYear)).toBe(true);
    expect(component.canCloseYear({ ...openYear, isCurrent: true })).toBe(false); expect(component.canSetCurrent({ ...openYear, isClosed: true })).toBe(false); expect(component.canCloseYear({ ...openYear, archivedAt: '2026-01-01' })).toBe(false);
  });

  it('confirms before invoking dedicated endpoints and cancel makes no call', async () => {
    confirm.mockResolvedValueOnce(false); await component.closeAcademicYear(openYear); expect(closeAcademicYear).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce(true); closeAcademicYear.mockResolvedValue({ success: true, data: { academicYear: { ...openYear, isClosed: true }, alreadyClosed: false } }); await component.closeAcademicYear(openYear); expect(closeAcademicYear).toHaveBeenCalledWith(openYear.id); expect(updateAcademicYear).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce(true); setCurrentAcademicYear.mockResolvedValue({ success: true, data: { ...openYear, isCurrent: true } }); await component.makeCurrent(openYear); expect(setCurrentAcademicYear).toHaveBeenCalledWith(openYear.id);
  });

  it('sends the selected academic year and date-only values, then shows the created period', async () => {
    component.selectedYear.set(openYear);
    component.showPeriodModal.set(true);
    component.periodForm.setValue({ nameAr: 'فصل 01', nameHe: '', startDate: '2026-09-01', endDate: '2026-12-31', sortOrder: 1, isActive: true });
    createAcademicPeriod.mockImplementation(async () => {
      periods.update((items) => [...items, createdPeriod]);
      return { success: true, data: createdPeriod };
    });

    await component.savePeriod();

    expect(createAcademicPeriod).toHaveBeenCalledWith({ nameAr: 'فصل 01', nameHe: '', startDate: '2026-09-01', endDate: '2026-12-31', sortOrder: 1, isActive: true, academicYearId: openYear.id });
    expect(component.selectedYearPeriods()).toContainEqual(createdPeriod);
    expect(component.showPeriodModal()).toBe(false);
    expect(component.toast()).toEqual({ message: 'تم إضافة الفترة الدراسية بنجاح.', type: 'success' });
  });

  it('loads periods for the selected academic year', () => {
    component.selectYear(openYear);
    expect(loadAcademicPeriods).toHaveBeenCalledWith(openYear.id);
  });

  it('renders known and generic create errors as readable Arabic', async () => {
    component.selectedYear.set(openYear);
    component.periodForm.setValue({ nameAr: 'فصل 01', nameHe: '', startDate: '2026-09-01', endDate: '2026-12-31', sortOrder: 1, isActive: true });
    createAcademicPeriod.mockResolvedValueOnce({ success: false, code: 'ACADEMIC_PERIOD_OUTSIDE_YEAR_RANGE', error: 'corrupted server text' });
    await component.savePeriod();
    expect(component.toast()?.message).toBe('يجب أن تقع تواريخ الفترة الدراسية ضمن نطاق السنة الأكاديمية.');

    createAcademicPeriod.mockResolvedValueOnce({ success: false, error: '' });
    await component.savePeriod();
    expect(component.toast()?.message).toBe('تعذر حفظ الفترة الدراسية.');
  });
});

describe('AcademicYearsComponent academic period modal template', () => {
  let fixture: ComponentFixture<AcademicYearsComponent>;
  let component: AcademicYearsComponent;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await TestBed.configureTestingModule({
      imports: [AcademicYearsComponent],
      providers: [
        {
          provide: ApiService,
          useValue: {
            academicYears: signal<AcademicYear[]>([openYear]),
            academicPeriods: signal<AcademicPeriod[]>([createdPeriod]),
            loadAcademicYears: vi.fn().mockResolvedValue(undefined),
            loadAcademicPeriods: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuthService,
          useValue: {
            currentContext: signal({ permissions: ['settings:update'] }),
            hasPermission: vi.fn((permission: string) => permission === 'settings:update'),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AcademicYearsComponent);
    component = fixture.componentInstance;
    component.selectYear(openYear);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => consoleError.mockRestore());

  const consoleErrors = () => consoleError.mock.calls.flat().join(' ');

  it('keeps the permission directive wired into the rendered template', () => {
    expect(fixture.nativeElement.textContent).toContain('ترفيع السنة');
    expect(consoleErrors()).not.toContain('NG0303');
  });

  it('creates the Add Academic Period modal without an unknown directive error', () => {
    component.openPeriodModal();
    fixture.detectChanges();

    expect(component.editingPeriod()).toBeNull();
    expect(fixture.nativeElement.querySelector('ui-modal form[ui-modal-body]')).not.toBeNull();
    expect(consoleErrors()).not.toContain('NG0303');
  });

  it('creates the Edit Academic Period modal without an unknown directive error', () => {
    component.openPeriodModal(createdPeriod);
    fixture.detectChanges();

    expect(component.editingPeriod()).toEqual(createdPeriod);
    expect(fixture.nativeElement.querySelector('ui-modal form[ui-modal-body]')).not.toBeNull();
    expect(consoleErrors()).not.toContain('NG0303');
  });
});
