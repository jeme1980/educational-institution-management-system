import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-header',
  imports: [MatIconModule, UiButtonComponent, UiPageHeaderComponent],
  templateUrl: './student-header.html',
})
export class StudentHeader {
  @Input() canCreate = true;
  @Output() exportTemplate = new EventEmitter<void>();
  @Output() exportStudents = new EventEmitter<void>();
  @Output() importFile = new EventEmitter<Event>();
  @Output() addStudent = new EventEmitter<void>();

  onFileChange(event: Event) {
    this.importFile.emit(event);
  }
}
