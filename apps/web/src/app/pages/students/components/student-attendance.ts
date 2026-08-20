import { ChangeDetectionStrategy, Component, input, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { StudentStateService } from '../services/student-state.service';
import { Attendance } from '../models/student.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-attendance',
  imports: [CommonModule, MatIconModule],
  templateUrl: './student-attendance.html',
})
export class StudentAttendance {
  private studentStateService = inject(StudentStateService);

  studentId = input.required<string>();
  attendance = signal<Attendance[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  formDate = signal(new Date().toISOString().slice(0, 10));
  formStatus = signal<'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>('PRESENT');
  formNotes = signal('');
  isSaving = signal(false);

  constructor() {
    effect(() => {
      const id = this.studentId();
      if (id) {
        this.loadAttendance(false);
      }
    });
  }

  loadAttendance(force = false) {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.studentStateService.getStudentAttendance(this.studentId(), force).subscribe({
      next: (data) => {
        this.attendance.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message || 'حدث خطأ أثناء تحميل سجل الحضور');
        this.isLoading.set(false);
      }
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.formDate.set(new Date().toISOString().slice(0, 10));
    this.formStatus.set('PRESENT');
    this.formNotes.set('');
    this.showForm.set(true);
  }

  openEdit(item: Attendance) {
    this.editingId.set(item.id);
    this.formDate.set(item.date);
    this.formStatus.set(item.status.toUpperCase() as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED');
    this.formNotes.set(item.notes || '');
    this.showForm.set(true);
  }

  cancelForm() { this.showForm.set(false); }

  saveAttendance() {
    this.isSaving.set(true);
    const data = { attendanceDate: this.formDate(), status: this.formStatus(), notes: this.formNotes().trim() || null };
    const request = this.editingId()
      ? this.studentStateService.updateStudentAttendance(this.editingId()!, data)
      : this.studentStateService.createStudentAttendance(this.studentId(), data);
    request.subscribe({
      next: () => { this.showForm.set(false); this.isSaving.set(false); this.loadAttendance(true); },
      error: (error) => { this.errorMessage.set(error.message || 'تعذر حفظ سجل الحضور.'); this.isSaving.set(false); },
    });
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'present':
        return 'حاضر';
      case 'absent':
        return 'غياب';
      case 'late':
        return 'تأخر';
      case 'excused':
        return 'غياب بعذر';
      default:
        return status;
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'present':
        return 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'absent':
        return 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200';
      case 'late':
        return 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200';
      case 'excused':
        return 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200';
      default:
        return 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700';
    }
  }

  getAttendanceStats() {
    const records = this.attendance();
    const total = records.length;
    if (total === 0) return { presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, percent: 100 };

    const presentCount = records.filter(r => r.status === 'present').length;
    const absentCount = records.filter(r => r.status === 'absent').length;
    const lateCount = records.filter(r => r.status === 'late').length;
    const excusedCount = records.filter(r => r.status === 'excused').length;
    
    // We count present and late as attendance for the rate, present = 1, late = 1 or 0.8 but let's count present + excused + late/2 etc or standard formula: presentCount / total
    const percent = Math.round(((presentCount + excusedCount + (lateCount * 0.9)) / total) * 100);

    return {
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      percent
    };
  }
}
