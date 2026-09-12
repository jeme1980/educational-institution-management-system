import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { StudyGroupMembersDialogComponent } from './study-group-members-dialog';

const group = { id: 'group-1', nameAr: 'مجموعة الرياضيات', classId: null } as any;
const firstMember = { id: 'member-1', enrollmentId: 'enrollment-1', firstNameAr: 'أحمد', lastNameAr: 'خليل' };
const secondMember = { id: 'member-2', enrollmentId: 'enrollment-2', firstNameAr: 'ليان', lastNameAr: 'حسن' };
const enrollments = [
  { id: 'enrollment-1', isActive: true, student: { firstNameAr: 'أحمد', lastNameAr: 'خليل' } },
  { id: 'enrollment-2', isActive: true, student: { firstNameAr: 'ليان', lastNameAr: 'حسن' } },
];

describe('StudyGroupMembersDialogComponent removal flow', () => {
  let fixture: ComponentFixture<StudyGroupMembersDialogComponent>;
  let component!: StudyGroupMembersDialogComponent;
  let api: {
    loadGroupMembers: ReturnType<typeof vi.fn>;
    addGroupMember: ReturnType<typeof vi.fn>;
    removeGroupMember: ReturnType<typeof vi.fn>;
  };
  let confirm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    api = {
      loadGroupMembers: vi.fn().mockResolvedValue([firstMember, secondMember]),
      addGroupMember: vi.fn().mockResolvedValue(true),
      removeGroupMember: vi.fn().mockResolvedValue(true),
    };
    confirm = vi.fn();
    await TestBed.configureTestingModule({
      imports: [StudyGroupMembersDialogComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudyGroupMembersDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('group', group);
    fixture.componentRef.setInput('enrollments', enrollments);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('removes one member directly, refetches both lists, and keeps the dialog open', async () => {
    api.loadGroupMembers.mockResolvedValueOnce([secondMember]);
    const changed = vi.fn();
    const closed = vi.fn();
    component.changed.subscribe(changed);
    component.closed.subscribe(closed);

    const removeButton = fixture.nativeElement.querySelector('[aria-label*="أحمد"]') as HTMLButtonElement;
    removeButton.click();
    await vi.waitFor(() => expect(api.loadGroupMembers).toHaveBeenCalledTimes(2));
    fixture.detectChanges();

    expect(confirm).not.toHaveBeenCalled();
    expect(api.removeGroupMember).toHaveBeenCalledWith('group-1', 'member-1');
    expect(component.members()).toEqual([secondMember]);
    expect(component.availableEnrollments().map(item => item.id)).toEqual(['enrollment-1']);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[aria-labelledby="members-dialog-title"]')).not.toBeNull();
  });

  it('keeps the member and shows an error when direct removal fails', async () => {
    api.removeGroupMember.mockResolvedValueOnce(false);
    const changed = vi.fn();
    component.changed.subscribe(changed);

    await component.removeMember(firstMember);

    expect(confirm).not.toHaveBeenCalled();
    expect(component.members()).toEqual([firstMember, secondMember]);
    expect(api.loadGroupMembers).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(component.toast()).toEqual({ type: 'error', message: 'تعذرت إزالة الطالب من المجموعة.' });
  });

  it('prevents a double click while one member removal is pending', async () => {
    let resolveRemoval!: (result: boolean) => void;
    api.removeGroupMember.mockReturnValueOnce(new Promise<boolean>(resolve => { resolveRemoval = resolve; }));

    const first = component.removeMember(firstMember);
    const second = component.removeMember(firstMember);

    expect(api.removeGroupMember).toHaveBeenCalledTimes(1);
    expect(component.removingMemberId()).toBe('member-1');
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('[aria-label*="أحمد"]') as HTMLButtonElement).disabled).toBe(true);

    resolveRemoval(false);
    await Promise.all([first, second]);
    expect(component.removingMemberId()).toBeNull();
  });

  it('removes all members directly and refetches an empty authoritative list', async () => {
    api.loadGroupMembers.mockResolvedValueOnce([]);
    const changed = vi.fn();
    const closed = vi.fn();
    component.changed.subscribe(changed);
    component.closed.subscribe(closed);

    const removeAllButton = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button: any) => button.textContent.includes('إزالة الكل')) as HTMLButtonElement;
    removeAllButton.click();
    await vi.waitFor(() => expect(api.loadGroupMembers).toHaveBeenCalledTimes(2));

    expect(confirm).not.toHaveBeenCalled();
    expect(api.removeGroupMember).toHaveBeenCalledTimes(2);
    expect(component.members()).toEqual([]);
    expect(component.availableEnrollments()).toHaveLength(2);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
  });

  it('uses the refetched server list after a partial remove-all failure', async () => {
    api.removeGroupMember.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    api.loadGroupMembers.mockResolvedValueOnce([secondMember]);

    await component.removeAllMembers();

    expect(confirm).not.toHaveBeenCalled();
    expect(component.members()).toEqual([secondMember]);
    expect(component.toast()?.type).toBe('error');
    expect(component.removingAll()).toBe(false);
  });
});
