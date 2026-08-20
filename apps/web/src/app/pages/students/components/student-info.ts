import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Student } from '../../../core/services/api.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-info',
  imports: [CommonModule, MatIconModule],
  templateUrl: './student-info.html',
})
export class StudentInfo {
  student = input.required<Student>();

  formatDate(d?: string): string {
    if (!d) return 'غير محدد';
    try {
      return new Date(d).toISOString().split('T')[0];
    } catch {
      return d;
    }
  }
}
