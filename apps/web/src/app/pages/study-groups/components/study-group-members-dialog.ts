import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { StudyGroupItem } from '../models/study-group.model';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';

@Component({
  selector: 'app-study-group-members-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-group-members-dialog.html',
})
export class StudyGroupMembersDialogComponent implements OnInit {
  private readonly confirmDialog = inject(ConfirmDialogService);
  @Input({ required: true }) group!: StudyGroupItem;
  @Input() enrollments: any[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  private readonly api = inject(ApiService);
  readonly members = signal<any[]>([]);
  readonly loading = signal(true);
  readonly savingId = signal<string | null>(null);
  readonly savingAll = signal(false);
  readonly memberSearch = signal('');
  readonly candidateSearch = signal('');
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly filteredMembers = computed(() => {
    const query = this.memberSearch().trim().toLocaleLowerCase('ar');
    return this.members().filter((member) => !query || this.searchText(member).includes(query));
  });

  readonly availableEnrollments = computed(() => {
    const assigned = new Set(this.members().map((member) => member.enrollmentId));
    const query = this.candidateSearch().trim().toLocaleLowerCase('ar');
    return this.enrollments.filter((item) => {
      const enrollment = item.enrollment || item;
      const id = enrollment.id || item.id;
      const classId = enrollment.classId || enrollment.classRoomId;
      if (!id || assigned.has(id) || enrollment.isActive === false || enrollment.isDeleted) return false;
      if (this.group.classId && classId !== this.group.classId) return false;
      return !query || this.searchText(item).includes(query);
    });
  });

  ngOnInit(): void {
    void this.loadMembers();
  }

  async loadMembers(): Promise<void> {
    this.loading.set(true);
    try {
      this.members.set(await this.api.loadGroupMembers(this.group.id));
    } finally {
      this.loading.set(false);
    }
  }

  enrollmentId(item: any): string {
    return item.enrollment?.id || item.id || '';
  }

  studentName(item: any): string {
    const student = item.student || item.enrollment?.student;
    return student ? `${student.firstNameAr || ''} ${student.lastNameAr || ''}`.trim() : 'طالب غير معروف';
  }

  studentNationalId(item: any): string {
    const student = item.student || item.enrollment?.student;
    return student?.nationalId || 'بدون رقم هوية';
  }

  className(item: any): string {
    return item.classRoom?.nameAr || item.enrollment?.classRoom?.nameAr || 'الصف غير محدد';
  }

  async addMember(item: any): Promise<void> {
    const id = this.enrollmentId(item);
    if (!id || this.savingId() || this.savingAll()) return;
    this.savingId.set(id);
    const ok = await this.api.addGroupMember(this.group.id, id);
    this.savingId.set(null);
    if (!ok) {
      this.showToast('error', 'تعذرت إضافة الطالب. تحقق من صف الطالب وحالة تسجيله.');
      return;
    }
    await this.loadMembers();
    this.changed.emit();
    this.showToast('success', 'تمت إضافة الطالب إلى المجموعة.');
  }

  async removeMember(member: any): Promise<void> {
    if (this.savingId() || this.savingAll()) return;
    const name = `${member.firstNameAr || ''} ${member.lastNameAr || ''}`.trim();
    if (!await this.confirmDialog.confirm({ title: 'إزالة طالب من المجموعة', message: `هل تريد إزالة ${name} من المجموعة؟`, variant: 'danger' })) return;
    this.savingId.set(member.id);
    const ok = await this.api.removeGroupMember(this.group.id, member.id);
    this.savingId.set(null);
    if (!ok) {
      this.showToast('error', 'تعذرت إزالة الطالب من المجموعة.');
      return;
    }
    await this.loadMembers();
    this.changed.emit();
    this.showToast('success', 'تمت إزالة الطالب من المجموعة.');
  }

  async addAllMembers(): Promise<void> {
    const candidates = this.availableEnrollments();
    if (!candidates.length || this.savingId() || this.savingAll()) return;
    this.savingAll.set(true);
    const results = await Promise.all(candidates.map((item) => this.api.addGroupMember(this.group.id, this.enrollmentId(item))));
    await this.loadMembers();
    this.changed.emit();
    this.savingAll.set(false);
    const added = results.filter(Boolean).length;
    this.showToast(results.every(Boolean) ? 'success' : 'error', `تمت إضافة ${added} من أصل ${candidates.length} طالب.`);
  }

  async removeAllMembers(): Promise<void> {
    const members = this.members();
    if (!members.length || this.savingId() || this.savingAll()) return;
    if (!await this.confirmDialog.confirm({ title: 'إزالة جميع الطلاب', message: `سيتم إزالة ${members.length} طالب من المجموعة. هل تريد المتابعة؟`, variant: 'danger' })) return;
    this.savingAll.set(true);
    const results = await Promise.all(members.map((member) => this.api.removeGroupMember(this.group.id, member.id)));
    await this.loadMembers();
    this.changed.emit();
    this.savingAll.set(false);
    const removed = results.filter(Boolean).length;
    this.showToast(results.every(Boolean) ? 'success' : 'error', `تمت إزالة ${removed} من أصل ${members.length} طالب.`);
  }

  private searchText(item: any): string {
    const student = item.student || item.enrollment?.student || item;
    return `${student.firstNameAr || ''} ${student.lastNameAr || ''} ${student.nationalId || ''} ${student.phoneNumber || ''}`.toLocaleLowerCase('ar');
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    window.setTimeout(() => this.toast.set(null), 3500);
  }
}
