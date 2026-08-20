import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ExamItem } from '../../../core/models/api.models';

@Component({
  selector: 'app-exam-table',
  standalone: true,
  imports: [CommonModule, MatIconModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:block;overflow:hidden;border:1px solid #e2e8f0;border-radius:1rem;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}'],
  templateUrl: './exam-table.html',
})
export class ExamTableComponent {
  @Input() exams: ExamItem[] = [];
  @Output() studyGroups = new EventEmitter<ExamItem>();
  @Output() questions = new EventEmitter<ExamItem>();
  @Output() results = new EventEmitter<ExamItem>();
  @Output() publish = new EventEmitter<ExamItem>();
  @Output() edit = new EventEmitter<ExamItem>();
  @Output() remove = new EventEmitter<ExamItem>();

  hasGroups(exam: ExamItem): boolean { return Number(exam._count?.examGroups || 0) > 0; }
  expected(exam: ExamItem): number { return exam.metrics?.expectedStudents || 0; }
  recorded(exam: ExamItem): number { return exam.metrics?.recordedStudents || 0; }
  progress(exam: ExamItem): number { const total = this.expected(exam); return total ? Math.min(100, Math.round((this.recorded(exam) / total) * 100)) : 0; }
  isComplete(exam: ExamItem): boolean { return this.expected(exam) > 0 && this.recorded(exam) >= this.expected(exam); }
}
