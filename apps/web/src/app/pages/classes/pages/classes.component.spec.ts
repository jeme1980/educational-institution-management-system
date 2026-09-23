import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ClassesComponent } from './classes.component';

describe('ClassesComponent design-system structure and filters', () => {
  const classes = [
    { id: 'class-1', institutionId: 'institution-1', academicYearId: 'year-1', stageId: 'stage-primary', gradeLevelId: 'grade-5', typeId: 'type-regular', compositionId: 'composition-mixed', parallelNumber: 1, classCode: '5-1', nameAr: 'الخامس أ', studentCount: 18 },
    { id: 'class-2', institutionId: 'institution-1', academicYearId: 'year-1', stageId: 'stage-secondary', gradeLevelId: 'grade-10', typeId: 'type-special', compositionId: 'composition-mixed', parallelNumber: 2, classCode: '10-2', nameAr: 'العاشر ب', studentCount: 9 },
  ];

  beforeEach(() => {
    const api = {
      classes: signal(classes),
      enrollments: signal([]),
      educationStages: signal([{ id: 'stage-primary', nameAr: 'ابتدائية' }, { id: 'stage-secondary', nameAr: 'ثانوية' }]),
      gradeLevels: signal([{ id: 'grade-5', nameAr: 'الخامس', codeNumber: 5 }, { id: 'grade-10', nameAr: 'العاشر', codeNumber: 10 }]),
      classTypes: signal([{ id: 'type-regular', nameAr: 'صف عادي' }, { id: 'type-special', nameAr: 'صف خاص' }]),
      compositionTypes: signal([{ id: 'composition-mixed', nameAr: 'مختلط' }]),
      institutions: signal([{ id: 'institution-1', nameAr: 'المدرسة' }]),
      academicYears: signal([{ id: 'year-1', yearLabel: '2026/2027', isCurrent: true }]),
      selectedInstitutionId: signal('institution-1'),
      selectedAcademicYearId: signal('year-1'),
      setSelectedInstitutionId: vi.fn(),
      setSelectedAcademicYearId: vi.fn(),
      loadLookups: vi.fn().mockResolvedValue(undefined),
      loadInstitutions: vi.fn().mockResolvedValue(undefined),
      loadAcademicYears: vi.fn().mockResolvedValue(undefined),
      loadClasses: vi.fn().mockResolvedValue(undefined),
      loadEnrollments: vi.fn().mockResolvedValue(undefined),
      classesApi: { lastError: signal('') },
    };

    TestBed.configureTestingModule({
      imports: [ClassesComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { hasPermission: vi.fn().mockReturnValue(true) } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(ClassesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.isLoading.set(false);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the shared filter panel, controls, table container, rows, and actions without pagination', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('ui-filter-panel')).toBeTruthy();
    expect(element.querySelectorAll('ui-input')).toHaveLength(1);
    expect(element.querySelectorAll('ui-select')).toHaveLength(2);
    expect(element.querySelector('.core-table-wrap')).toBeTruthy();
    expect(element.querySelectorAll('tbody .class-row')).toHaveLength(2);
    expect(element.querySelectorAll('tbody ui-table-actions')).toHaveLength(2);
    expect(element.querySelectorAll('tbody ui-button')).toHaveLength(6);
    expect(element.textContent).not.toContain('تحميل المزيد');
    expect(element.textContent).not.toContain('من أصل');
  });

  it('keeps search, stage, and class-type filters functional', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const search = element.querySelector('ui-input input') as HTMLInputElement;
    search.value = 'العاشر';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.filteredClasses().map(item => item.id)).toEqual(['class-2']);

    component.clearFilters();
    component.stageFilter.set('stage-primary');
    fixture.detectChanges();
    expect(component.filteredClasses().map(item => item.id)).toEqual(['class-1']);

    component.clearFilters();
    component.typeFilter.set('type-special');
    fixture.detectChanges();
    expect(component.filteredClasses().map(item => item.id)).toEqual(['class-2']);
  });
});
