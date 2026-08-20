import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { TabType } from '../models/student.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-form-modal',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './student-form-modal.html',
})
export class StudentFormModal {
  apiService = inject(ApiService);

  show = input<boolean>(false);
  isEditing = input<boolean>(false);
  activeTab = input<TabType>('basic');
  studentForm = input<FormGroup | null>(null);

  closeForm = output<void>();
  tabChange = output<TabType>();
  saveForm = output<void>();

  onSubmit() {
    this.saveForm.emit();
  }
}
