import { ChangeDetectionStrategy, Component, input, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { StudentStateService } from '../services/student-state.service';
import { Grade } from '../models/student.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-grades-table',
  imports: [CommonModule, MatIconModule],
  templateUrl: './student-grades-table.html',
})
export class StudentGradesTable {
  private studentStateService = inject(StudentStateService);

  studentId = input.required<string>();
  grades = signal<Grade[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.studentId();
      if (id) {
        this.loadGrades(false);
      }
    });
  }

  loadGrades(force = false) {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.studentStateService.getStudentGrades(this.studentId(), force).subscribe({
      next: (data) => {
        this.grades.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message || 'حدث خطأ أثناء تحميل الدرجات');
        this.isLoading.set(false);
      }
    });
  }
}
