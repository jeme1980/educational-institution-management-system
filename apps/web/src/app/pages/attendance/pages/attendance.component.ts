import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { AttendanceApiService, AttendanceRosterStudent, AttendanceStatus } from '../services/attendance-api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';

@Component({ selector: 'app-attendance', imports: [CommonModule, FormsModule, MatIconModule, UiButtonComponent, UiPageHeaderComponent, UiFilterPanelComponent, UiSelectComponent], templateUrl: './attendance.component.html', styleUrl: './attendance.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class AttendanceComponent implements OnInit {
  private readonly api = inject(ApiService); private readonly auth = inject(AuthService); private readonly attendanceApi = inject(AttendanceApiService); private readonly confirmDialog = inject(ConfirmDialogService);
  readonly date = signal(new Date().toISOString().slice(0, 10)); readonly targetType = signal<'class' | 'group'>('class'); readonly targetId = signal(''); readonly students = signal<AttendanceRosterStudent[]>([]); readonly loading = signal(false); readonly saving = signal(false); readonly dirty = signal(false); readonly error = signal(''); readonly notice = signal(''); readonly statuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
  readonly summary = computed(() => { const rows = this.students(); const counts = { total: rows.length, PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, unrecorded: 0 }; rows.forEach(row => { const status = row.attendance?.status; if (status) counts[status]++; else counts.unrecorded++; }); return counts; });
  readonly canUpdate = () => this.auth.hasPermission('attendance:update');
  async ngOnInit(): Promise<void> { await Promise.all([this.api.loadClasses(), this.api.loadStudyGroups()]); const firstClass = this.classes()[0]?.id; this.targetId.set(firstClass || this.groups()[0]?.id || ''); if (!firstClass) this.targetType.set('group'); await this.loadRoster(); }
  classes() { return this.api.classes().filter(item => !item.archivedAt); } groups() { return this.api.studyGroups().filter(item => !item.archivedAt && item.isActive); }
  selectedTarget() { return this.targetType() === 'class' ? { classId: this.targetId() } : { studyGroupId: this.targetId() }; }
  async setTargetType(value: 'class' | 'group'): Promise<void> { if (!await this.confirmDiscardIfNeeded()) return; this.targetType.set(value); this.targetId.set(value === 'class' ? this.classes()[0]?.id || '' : this.groups()[0]?.id || ''); await this.loadRoster(); }
  async setTargetId(value: string): Promise<void> { if (!await this.confirmDiscardIfNeeded()) return; this.targetId.set(value); await this.loadRoster(); }
  async setDate(value: string): Promise<void> { if (!await this.confirmDiscardIfNeeded()) return; this.date.set(value); await this.loadRoster(); }
  async loadRoster(): Promise<void> { if (!this.date() || !this.targetId()) { this.students.set([]); return; } this.loading.set(true); this.error.set(''); this.notice.set(''); const result = await this.attendanceApi.loadRoster(this.date(), this.selectedTarget()); this.students.set(result.students); this.dirty.set(false); this.error.set(result.error || ''); this.loading.set(false); }
  setStatus(student: AttendanceRosterStudent, status: AttendanceStatus): void { student.attendance = { ...(student.attendance || { id: '', notes: null, date: this.date() }), status }; this.students.set([...this.students()]); this.dirty.set(true); this.notice.set(''); }
  setAllPresent(): void { this.students.update(rows => rows.map(student => ({ ...student, attendance: { ...(student.attendance || { id: '', notes: null, date: this.date() }), status: 'PRESENT' as AttendanceStatus } }))); this.dirty.set(true); this.notice.set(''); }
  statusLabel(status: AttendanceStatus): string { return { PRESENT: 'حاضر', ABSENT: 'غائب', LATE: 'متأخر', EXCUSED: 'معذور' }[status]; }
  async save(): Promise<void> { if (!this.canUpdate() || !this.students().length || !this.dirty()) return; this.saving.set(true); this.error.set(''); this.notice.set(''); const records = this.students().filter(item => item.attendance?.status).map(item => ({ studentEnrollmentId: item.studentEnrollmentId, status: item.attendance!.status, notes: item.attendance?.notes || null })); const result = records.length ? await this.attendanceApi.saveBatch(this.date(), this.selectedTarget(), records) : { ok: true }; this.saving.set(false); this.error.set(result.error || ''); if (result.ok) { this.dirty.set(false); this.notice.set('تم حفظ الحضور بنجاح.'); } }
  private async confirmDiscardIfNeeded(): Promise<boolean> { if (!this.dirty()) return true; return this.confirmDialog.confirm({ title: 'تغييرات غير محفوظة', message: 'ستفقد التغييرات الحالية إذا غيّرت التاريخ أو النطاق أو الاختيار. هل تريد المتابعة؟', variant: 'warning' }); }
}
