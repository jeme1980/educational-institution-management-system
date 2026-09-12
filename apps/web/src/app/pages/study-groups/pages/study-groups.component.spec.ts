import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiBadgeComponent } from '../../../shared/components/ui-badge/ui-badge.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { StudyGroupsStateService } from '../services/study-groups-state.service';
import { StudyGroupsComponent } from './study-groups.component';

describe('StudyGroupsComponent design-system contract', () => {
  let fixture: ComponentFixture<StudyGroupsComponent>;
  let confirm: ReturnType<typeof vi.fn>;
  let deleteStudyGroup: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const group = {
      id: 'group-1', institutionId: 'institution-1', academicYearId: 'year-1', subjectId: 'subject-1',
      staffAssignmentId: 'assignment-1', nameAr: 'مجموعة الرياضيات', isActive: true,
      subject: { id: 'subject-1', nameAr: 'الرياضيات' },
      staffAssignment: { id: 'assignment-1', staffMember: { firstNameAr: 'سارة', familyNameAr: 'خليل' } },
      _count: { students: 5, examGroups: 0 },
    };
    const api = {
      subjects: signal([{ id: 'subject-1', nameAr: 'الرياضيات' }]), classes: signal([]), enrollments: signal([]),
      institutions: signal([]), academicYears: signal([]), selectedInstitutionId: signal(null), selectedAcademicYearId: signal(null),
      staffAssignments: signal([]), setSelectedInstitutionId: vi.fn(), setSelectedAcademicYearId: vi.fn(),
      loadInstitutions: vi.fn().mockResolvedValue(true), loadAcademicYears: vi.fn().mockResolvedValue(true),
      loadSubjects: vi.fn().mockResolvedValue(true), loadClasses: vi.fn().mockResolvedValue(true),
      loadStaffAssignments: vi.fn().mockResolvedValue(true), loadEnrollments: vi.fn().mockResolvedValue(true),
      classesApi: { studyGroupError: signal('') },
    };
    confirm = vi.fn().mockResolvedValue(false);
    deleteStudyGroup = vi.fn().mockResolvedValue(true);
    const groupsState = { studyGroups: signal([group]), loadStudyGroups: vi.fn().mockResolvedValue(true), deleteStudyGroup };

    await TestBed.configureTestingModule({
      imports: [StudyGroupsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: StudyGroupsStateService, useValue: groupsState },
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudyGroupsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.isLoading.set(false);
    fixture.detectChanges();
  });

  it('uses three shared statistic cards with the approved icons and values', () => {
    const cards = fixture.debugElement.queryAll(By.directive(UiStatCardComponent)).map(item => item.componentInstance as UiStatCardComponent);

    expect(cards.map(card => card.icon())).toEqual(['groups', 'check_circle', 'school']);
    expect(cards.map(card => card.value())).toEqual([1, 1, 5]);
    expect(fixture.nativeElement.querySelectorAll('.study-groups-stats .ui-stat-card')).toHaveLength(3);
  });

  it('keeps the three filters, removes the search icon, and shows a direct summary without pagination wording', () => {
    const filterPanel = fixture.nativeElement.querySelector('ui-filter-panel') as HTMLElement;
    const search = filterPanel.querySelector('.study-groups-search') as HTMLElement;
    const summary = filterPanel.querySelector('.study-groups-summary') as HTMLElement;

    expect(filterPanel.querySelectorAll('select')).toHaveLength(3);
    expect(search.querySelector('mat-icon')).toBeNull();
    expect(search.querySelector('input')?.getAttribute('placeholder')).toBe('ابحث باسم المجموعة أو المادة أو المعلم...');
    expect(summary.textContent).toContain('1 مجموعة');
    expect(summary.textContent).not.toContain('عرض');
    expect(summary.textContent).not.toContain(' من ');
    expect(fixture.nativeElement.querySelector('.pagination')).toBeNull();
  });

  it('uses shared badges and compact accessible actions with danger-ghost reserved for delete', () => {
    const badges = fixture.debugElement.queryAll(By.directive(UiBadgeComponent)).map(item => item.componentInstance as UiBadgeComponent);
    const actions = fixture.debugElement.query(By.directive(UiTableActionsComponent)).queryAll(By.directive(UiButtonComponent)).map(item => item.componentInstance as UiButtonComponent);

    expect(badges).toHaveLength(2);
    expect(badges.map(badge => badge.tone())).toEqual(['neutral', 'success']);
    expect(actions.map(action => action.size())).toEqual(['sm', 'sm', 'sm', 'sm']);
    expect(actions.map(action => action.variant())).toEqual(['ghost', 'ghost', 'ghost', 'danger-ghost']);
    expect(actions.map(action => action.ariaLabel())).toEqual(['عرض المجموعة', 'إدارة طلاب المجموعة', 'تعديل المجموعة', 'حذف المجموعة']);
    expect(actions.every(action => action.iconOnly())).toBe(true);
  });

  it('keeps confirmation for deleting the study group itself', async () => {
    const group = fixture.componentInstance.groups()[0];

    await fixture.componentInstance.deleteGroup(group);

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'أرشفة مجموعة التعلم' }));
    expect(deleteStudyGroup).not.toHaveBeenCalled();
  });
});
