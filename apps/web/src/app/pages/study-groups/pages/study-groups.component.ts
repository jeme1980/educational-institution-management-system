import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { StudyGroupItem } from '../models/study-group.model';
import { StudyGroupsStateService } from '../services/study-groups-state.service';
import { StudyGroupMembersDialogComponent } from '../components/study-group-members-dialog';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-study-groups',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, StudyGroupMembersDialogComponent],
  templateUrl: './study-groups.component.html',
  styleUrl: './study-groups.component.css',
})
export class StudyGroupsComponent implements OnInit {
  readonly apiService = inject(ApiService);
  readonly confirmDialog = inject(ConfirmDialogService);
  private readonly groupsState = inject(StudyGroupsStateService);
  private readonly fb = inject(FormBuilder);
  readonly searchTerm = signal('');
  readonly subjectFilter = signal('');
  readonly classFilter = signal('');
  readonly statusFilter = signal('');
  readonly showArchived = signal(false);
  readonly showModal = signal(false);
  readonly showDetailsModal = signal(false);
  readonly showMembersModal = signal(false);
  readonly showMembersPanel = signal(false);
  readonly editingGroup = signal<StudyGroupItem | null>(null);
  readonly selectedGroup = signal<StudyGroupItem | null>(null);
  readonly groupMembers = signal<any[]>([]);
  readonly memberSearch = signal('');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isMembersLoading = signal(false);
  readonly isDeleting = signal<string | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly groupForm = this.fb.nonNullable.group({
    nameAr: ['', [Validators.required, Validators.maxLength(150)]],
    nameHe: ['', Validators.maxLength(150)],
    subjectId: ['', Validators.required],
    classId: [''],
    staffAssignmentId: [''],
    isActive: [true],
  });

  readonly groups = computed(() => this.groupsState.studyGroups());
  readonly activeCount = computed(() => this.groups().filter(g => g.isActive).length);
  readonly assignedStudentsCount = computed(() => this.groups().reduce((sum, g) => sum + (g._count?.students || 0), 0));
  readonly teacherCount = computed(() => new Set(this.groups().map(g => g.staffAssignmentId).filter(Boolean)).size);
  readonly filteredGroups = computed(() => {
    const q = this.searchTerm().trim().toLocaleLowerCase('ar');
    return this.groups().filter(group => {
      if (this.subjectFilter() && group.subjectId !== this.subjectFilter()) return false;
      if (this.classFilter() && group.classId !== this.classFilter()) return false;
      if (this.statusFilter() && String(group.isActive) !== this.statusFilter()) return false;
      if (!q) return true;
      return [group.nameAr, group.nameHe, group.subject?.nameAr, group.classRoom?.nameAr, this.getTeacherName(group)].some(v => String(v || '').toLocaleLowerCase('ar').includes(q));
    });
  });
  readonly availableEnrollments = computed(() => {
    const current = new Set(this.groupMembers().map(m => m.enrollmentId));
    return this.apiService.enrollments().filter(item => {
      const id = this.enrollmentId(item);
      if (!id || current.has(id)) return false;
      const q = this.memberSearch().trim().toLocaleLowerCase('ar');
      if (!q) return true;
      const student = item.student || item.enrollment?.student;
      return `${student?.firstNameAr || ''} ${student?.lastNameAr || ''}`.toLocaleLowerCase('ar').includes(q);
    });
  });

  ngOnInit(): void { void this.refresh(); }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    // Old local data used placeholders such as "ay-2025-2026". Prisma stores
    // both context values as UUIDs, so never send a placeholder header.
    if (!this.isUuid(this.apiService.selectedInstitutionId())) this.apiService.setSelectedInstitutionId(null);
    if (!this.isUuid(this.apiService.selectedAcademicYearId())) this.apiService.setSelectedAcademicYearId(null);
    await Promise.all([this.apiService.loadInstitutions(), this.apiService.loadAcademicYears()]);
    const institutionId = this.apiService.selectedInstitutionId() || this.apiService.institutions()[0]?.id || null;
    const academicYearId = this.apiService.selectedAcademicYearId() || this.apiService.academicYears().find(year => year.isCurrent)?.id || this.apiService.academicYears()[0]?.id || null;
    if (institutionId) this.apiService.setSelectedInstitutionId(institutionId);
    if (academicYearId) this.apiService.setSelectedAcademicYearId(academicYearId);
    await Promise.all([this.groupsState.loadStudyGroups(this.showArchived()), this.apiService.loadSubjects(), this.apiService.loadClasses(), this.apiService.loadStaffAssignments(), this.apiService.loadEnrollments()]);
    this.isLoading.set(false);
  }

  private isUuid(value: string | null): boolean { return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

  updateSearch(e: Event): void { this.searchTerm.set((e.target as HTMLInputElement).value); }
  setFilter(signal: 'subject' | 'class' | 'status', e: Event): void { const value = (e.target as HTMLSelectElement).value; if (signal === 'subject') this.subjectFilter.set(value); if (signal === 'class') this.classFilter.set(value); if (signal === 'status') this.statusFilter.set(value); }
  clearFilters(): void { this.searchTerm.set(''); this.subjectFilter.set(''); this.classFilter.set(''); this.statusFilter.set(''); }
  async toggleArchived(): Promise<void> { this.showArchived.update(value => !value); await this.refresh(); }
  getTeacherName(group: StudyGroupItem): string { const staff = group.staffAssignment?.staffMember; return staff ? `${staff.firstNameAr} ${staff.familyNameAr}` : 'غير معين'; }
  getClassName(group: StudyGroupItem): string { return group.classRoom ? `${group.classRoom.nameAr}${group.classRoom.gradeLevel?.nameAr ? ` · ${group.classRoom.gradeLevel.nameAr}` : ''}` : 'كل الصفوف'; }

  openAddModal(): void { this.editingGroup.set(null); this.groupForm.reset({ nameAr: '', nameHe: '', subjectId: this.apiService.subjects()[0]?.id || '', classId: '', staffAssignmentId: '', isActive: true }); this.showModal.set(true); }
  openEditModal(group: StudyGroupItem): void { this.editingGroup.set(group); this.groupForm.reset({ nameAr: group.nameAr, nameHe: group.nameHe || '', subjectId: group.subjectId, classId: group.classId || '', staffAssignmentId: group.staffAssignmentId || '', isActive: group.isActive }); this.showModal.set(true); }
  closeModal(): void { if (!this.isSaving()) { this.showModal.set(false); this.editingGroup.set(null); } }
  viewDetails(group: StudyGroupItem): void { this.selectedGroup.set(group); this.showDetailsModal.set(true); }

  async saveGroup(): Promise<void> {
    if (this.groupForm.invalid || this.isSaving()) { this.groupForm.markAllAsTouched(); return; }
    this.isSaving.set(true);
    const editing = !!this.editingGroup();
    const value = this.groupForm.getRawValue();
    const ok = editing ? await this.groupsState.updateStudyGroup(this.editingGroup()!.id, value) : await this.groupsState.createStudyGroup(value);
    this.isSaving.set(false);
    if (ok) { this.closeModal(); this.notify('success', editing ? 'تم تعديل المجموعة بنجاح.' : 'تمت إضافة المجموعة بنجاح.'); }
    else this.notify('error', this.apiService.classesApi.studyGroupError() || 'تعذر حفظ المجموعة.');
  }

  async deleteGroup(group: StudyGroupItem): Promise<void> {
    if (this.isDeleting()) return;
    if (group.archivedAt) { await this.restoreGroup(group); return; }
    const examWarning = (group._count?.examGroups || 0) > 0 ? '\nهذه المجموعة مرتبطة بامتحانات، أرشفتها ستُخفيها من قوائم الربط المستقبلية.' : '';
    if (!await this.confirmDialog.confirm({ title: 'أرشفة مجموعة التعلم', message: `سيتم أرشفة مجموعة «${group.nameAr}» بدل حذفها نهائيًا. يمكن استعادتها لاحقًا. هل تريد المتابعة؟`, variant: 'warning' })) return;
    if (examWarning && !await this.confirmDialog.confirm({ title: 'متابعة الأرشفة', message: examWarning.trim() + '\nهل تريد متابعة الأرشفة؟', variant: 'warning' })) return;
    this.isDeleting.set(group.id);
    const ok = await this.groupsState.deleteStudyGroup(group.id);
    this.isDeleting.set(null);
    this.notify(ok ? 'success' : 'error', ok ? 'تمت أرشفة مجموعة التعلم بنجاح.' : (this.apiService.classesApi.studyGroupError() || 'تعذر أرشفة مجموعة التعلم.'));
  }

  async restoreGroup(group: StudyGroupItem): Promise<void> {
    if (this.isDeleting()) return;
    this.isDeleting.set(group.id);
    const ok = await this.groupsState.restoreStudyGroup(group.id);
    this.isDeleting.set(null);
    this.notify(ok ? 'success' : 'error', ok ? 'تمت استعادة مجموعة التعلم بنجاح.' : (this.apiService.classesApi.studyGroupError() || 'تعذر استعادة مجموعة التعلم.'));
  }

  async openMembers(group: StudyGroupItem): Promise<void> { this.selectedGroup.set(group); this.showMembersPanel.set(true); }
  async refreshMembersData(): Promise<void> { await this.groupsState.loadStudyGroups(this.showArchived()); }
  enrollmentId(item: any): string { return item.enrollment?.id || item.id || ''; }
  studentName(item: any): string { const s = item.student || item.enrollment?.student; return s ? `${s.firstNameAr || ''} ${s.lastNameAr || ''}`.trim() : 'طالب غير معروف'; }
  async addMember(item: any): Promise<void> { const group = this.selectedGroup(); const id = this.enrollmentId(item); if (!group || !id) return; const ok = await this.apiService.addGroupMember(group.id, id); if (ok) { this.groupMembers.set(await this.apiService.loadGroupMembers(group.id)); this.notify('success', 'تمت إضافة الطالب للمجموعة.'); } else this.notify('error', 'تعذر إضافة الطالب للمجموعة.'); }
  async removeMember(member: any): Promise<void> { const group = this.selectedGroup(); if (!group || !await this.confirmDialog.confirm({ title: 'إزالة طالب من المجموعة', message: 'هل تريد إزالة الطالب من المجموعة؟', variant: 'danger' })) return; const ok = await this.apiService.removeGroupMember(group.id, member.id); if (ok) { this.groupMembers.set(await this.apiService.loadGroupMembers(group.id)); this.notify('success', 'تمت إزالة الطالب من المجموعة.'); } else this.notify('error', 'تعذر إزالة الطالب.'); }
  private notify(type: 'success' | 'error', message: string): void { this.toast.set({ type, message }); setTimeout(() => this.toast.set(null), 3500); }
}
