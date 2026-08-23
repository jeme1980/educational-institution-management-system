import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { AttendanceApiService, AttendanceRosterStudent, AttendanceStatus } from '../services/attendance-api.service';

@Component({ selector: 'app-attendance', imports: [CommonModule, FormsModule, MatIconModule], templateUrl: './attendance.component.html', styleUrl: './attendance.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class AttendanceComponent implements OnInit {
  private readonly api = inject(ApiService); private readonly auth = inject(AuthService); private readonly attendanceApi = inject(AttendanceApiService);
  readonly date = signal(new Date().toISOString().slice(0, 10)); readonly targetType = signal<'class' | 'group'>('class'); readonly targetId = signal(''); readonly students = signal<AttendanceRosterStudent[]>([]); readonly loading = signal(false); readonly saving = signal(false); readonly error = signal(''); readonly notice = signal(''); readonly statuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
  readonly canUpdate = () => this.auth.hasPermission('attendance:update');
  async ngOnInit(): Promise<void> { await Promise.all([this.api.loadClasses(), this.api.loadStudyGroups()]); const firstClass = this.classes()[0]?.id; this.targetId.set(firstClass || this.groups()[0]?.id || ''); if (!firstClass) this.targetType.set('group'); await this.loadRoster(); }
  classes() { return this.api.classes().filter(item => !item.archivedAt); } groups() { return this.api.studyGroups().filter(item => !item.archivedAt && item.isActive); }
  selectedTarget() { return this.targetType() === 'class' ? { classId: this.targetId() } : { studyGroupId: this.targetId() }; }
  setTargetType(value: 'class' | 'group'): void { this.targetType.set(value); this.targetId.set(value === 'class' ? this.classes()[0]?.id || '' : this.groups()[0]?.id || ''); void this.loadRoster(); }
  setTargetId(value: string): void { this.targetId.set(value); void this.loadRoster(); } setDate(value: string): void { this.date.set(value); void this.loadRoster(); }
  async loadRoster(): Promise<void> { if (!this.date() || !this.targetId()) { this.students.set([]); return; } this.loading.set(true); this.error.set(''); this.notice.set(''); const result = await this.attendanceApi.loadRoster(this.date(), this.selectedTarget()); this.students.set(result.students.map(item => ({ ...item, attendance: item.attendance || { id: '', status: 'PRESENT', notes: null, date: this.date() } }))); this.error.set(result.error || ''); this.loading.set(false); }
  setStatus(student: AttendanceRosterStudent, status: AttendanceStatus): void { student.attendance = { ...(student.attendance || { id: '', notes: null, date: this.date() }), status }; this.students.set([...this.students()]); }
  statusLabel(status: AttendanceStatus): string { return { PRESENT: 'حاضر', ABSENT: 'غائب', LATE: 'متأخر', EXCUSED: 'معذور' }[status]; }
  async save(): Promise<void> { if (!this.canUpdate() || !this.students().length) return; this.saving.set(true); this.error.set(''); this.notice.set(''); const result = await this.attendanceApi.saveBatch(this.date(), this.selectedTarget(), this.students().map(item => ({ studentEnrollmentId: item.studentEnrollmentId, status: item.attendance?.status || 'PRESENT', notes: item.attendance?.notes || null }))); this.saving.set(false); this.error.set(result.error || ''); if (result.ok) this.notice.set('تم حفظ الحضور بنجاح.'); }
}
