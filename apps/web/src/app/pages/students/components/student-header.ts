import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-header',
  imports: [MatIconModule],
  templateUrl: './student-header.html',
})
export class StudentHeader {
  @Output() exportTemplate = new EventEmitter<void>();
  @Output() exportStudents = new EventEmitter<void>();
  @Output() importFile = new EventEmitter<Event>();
  @Output() addStudent = new EventEmitter<void>();

  onFileChange(event: Event) {
    this.importFile.emit(event);
  }
}
