import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../core/services/api.service';
import { StaffDevelopmentAnalysis } from '../../../core/models/api.models';
import { UiBadgeComponent } from '../../../shared/components/ui-badge/ui-badge.component';
import { StaffDevelopmentAnalysisComponent } from './staff-development-analysis.component';

const year = { id: 'year-a', yearLabel: '2026', startDate: '2026-01-01', endDate: '2026-12-31' };
const response: StaffDevelopmentAnalysis = {
  summary: { activeStaff: 2, participatingStaff: 1, nonParticipatingStaff: 1, totalRecords: 1, totalHours: 12, averageHours: 12, distinctProviders: 1, distinctCompletions: 1 },
  rows: [
    { staffId: 'staff-b', firstNameAr: 'باسم', familyNameAr: 'باء', specialization: { id: 'math', nameAr: 'رياضيات' }, participated: false, developmentCount: 0, totalHours: 0, lastDevelopmentDate: null, lastDevelopmentName: null, lastProvider: null },
    { staffId: 'staff-a', firstNameAr: 'أحمد', familyNameAr: 'ألف', specialization: { id: 'math', nameAr: 'رياضيات' }, participated: true, developmentCount: 1, totalHours: 12, lastDevelopmentDate: '2026-02-01T00:00:00.000Z', lastDevelopmentName: 'استكمال أ', lastProvider: 'جهة أ' },
  ],
  aggregates: {
    specialties: [{ label: 'رياضيات', hours: 12, records: 1, staff: 1 }],
    providers: [{ label: 'جهة أ', hours: 12, records: 1, staff: 1 }],
    completions: [{ code: 'course-a', label: 'استكمال أ', hours: 12, records: 1, staff: 1 }],
    yearly: [{ label: '2026', hours: 12, records: 1, staff: 1 }],
  },
  options: { completions: [{ code: 'course-a', label: 'استكمال أ' }] },
};

class AnalysisApiStub {
  readonly academicYears = signal([year]);
  readonly publicLookups = signal<Record<string, any[]>>({ specializations: [{ id: 'math', nameAr: 'رياضيات', isActive: true }], providers: [{ id: 'provider-a', name: 'جهة أ', isActive: true }] });
  readonly staff = signal<any[]>([
    { id: 'staff-a', firstNameAr: 'أحمد', familyNameAr: 'ألف', specializationId: 'math', specialization: { id: 'math', nameAr: 'رياضيات' }, archivedAt: null },
    { id: 'staff-b', firstNameAr: 'باسم', familyNameAr: 'باء', specializationId: 'math', specialization: { id: 'math', nameAr: 'رياضيات' }, archivedAt: null },
  ]);
  readonly loadStaff = vi.fn(async () => undefined);
  readonly loadPublicLookups = vi.fn(async () => undefined);
  readonly loadAcademicYears = vi.fn(async () => undefined);
  readonly loadStaffDevelopmentAnalysis = vi.fn(async (params: any) => params.participationStatus === 'not_participated'
    ? { ...response, summary: { ...response.summary, totalRecords: 0, totalHours: 0, averageHours: 0, distinctProviders: 0, distinctCompletions: 0 }, rows: [response.rows[0]], aggregates: { specialties: [], providers: [], completions: [], yearly: [] } }
    : response);
}

describe('StaffDevelopmentAnalysisComponent coverage', () => {
  let fixture: ComponentFixture<StaffDevelopmentAnalysisComponent>;
  let component: StaffDevelopmentAnalysisComponent;
  let api: AnalysisApiStub;

  beforeEach(async () => {
    api = new AnalysisApiStub();
    await TestBed.configureTestingModule({ imports: [StaffDevelopmentAnalysisComponent], providers: [{ provide: ApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(StaffDevelopmentAnalysisComponent); component = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable();
    if (!component.analysis()) await component.loadAnalysis();
    fixture.detectChanges();
  });

  it('renders zero-development values and both semantic participation badges', () => {
    const rows = [...fixture.nativeElement.querySelectorAll('tbody tr')] as HTMLElement[];
    const zeroCells = [...rows[0].querySelectorAll('td')] as HTMLElement[];
    expect(rows[0].textContent).toContain('لم يشارك');
    expect(rows[0].textContent).toContain('لم يلتحق بأي استكمال');
    expect(zeroCells[3].textContent?.trim()).toBe('0');
    expect(zeroCells[4].textContent?.trim()).toBe('0');
    expect(zeroCells[5].textContent?.trim()).toBe('—');
    expect(zeroCells[7].textContent?.trim()).toBe('—');
    expect(rows[1].textContent).toContain('شارك');
    const badges = fixture.debugElement.queryAll(By.directive(UiBadgeComponent)).map((item) => item.componentInstance as UiBadgeComponent);
    expect(badges.map((badge) => badge.tone())).toEqual(['warning', 'success']);
  });

  it('shows the non-participating KPI and a real participation filter without pagination', () => {
    expect(fixture.nativeElement.textContent).toContain('لم يلتحقوا باستكمال');
    const participationSelect = [...fixture.nativeElement.querySelectorAll('label')].find((label: HTMLElement) => label.textContent?.includes('حالة المشاركة'))?.querySelector('select') as HTMLSelectElement;
    expect([...participationSelect.options].map((option) => option.value)).toEqual(['all', 'participated', 'not_participated']);
    expect(fixture.nativeElement.querySelector('[class*="pagination"], [aria-label*="صفحة"]')).toBeNull();
  });

  it('updates the table when participation status changes', async () => {
    await component.participationChanged('not_participated'); fixture.detectChanges();
    expect(component.teacherRows()).toHaveLength(1);
    expect(component.teacherRows()[0].developmentCount).toBe(0);
    expect(api.loadStaffDevelopmentAnalysis).toHaveBeenLastCalledWith(expect.objectContaining({ participationStatus: 'not_participated' }));
  });

  it('composes specialization, year dates, and participation filters', async () => {
    component.selectedYearId.set(year.id);
    component.selectedSpecializationId.set('math');
    await component.participationChanged('not_participated');
    expect(api.loadStaffDevelopmentAnalysis).toHaveBeenLastCalledWith(expect.objectContaining({ specializationId: 'math', startDate: year.startDate, endDate: year.endDate, participationStatus: 'not_participated' }));
  });

  it('shows the staff empty state only when no staff rows match', () => {
    component.analysis.set({ ...response, rows: [] }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('لا يوجد موظفون يطابقون عوامل التصفية.');
  });
});
