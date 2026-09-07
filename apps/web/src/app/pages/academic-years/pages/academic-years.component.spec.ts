import { signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiService, AcademicYear } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { AcademicYearsComponent } from './academic-years.component';

const openYear: AcademicYear = { id: 'open', institutionId: 'school', yearLabel: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', isCurrent: false, isClosed: false };

describe('AcademicYearsComponent state actions', () => {
  const years = signal<AcademicYear[]>([openYear]);
  const updateAcademicYear = vi.fn();
  const closeAcademicYear = vi.fn();
  const setCurrentAcademicYear = vi.fn();
  const confirm = vi.fn();
  let component: AcademicYearsComponent;

  beforeEach(() => {
    years.set([openYear]); updateAcademicYear.mockReset(); closeAcademicYear.mockReset(); setCurrentAcademicYear.mockReset(); confirm.mockReset();
    TestBed.configureTestingModule({ providers: [FormBuilder,
      { provide: ApiService, useValue: { academicYears: years, academicPeriods: signal([]), updateAcademicYear, closeAcademicYear, setCurrentAcademicYear, loadAcademicYears: vi.fn(), loadAcademicPeriods: vi.fn(), createAcademicYear: vi.fn() } },
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
});
