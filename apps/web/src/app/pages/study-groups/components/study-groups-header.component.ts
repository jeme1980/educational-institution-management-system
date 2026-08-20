import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-study-groups-header',
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
      <div>
        <h1 class="font-headline-lg text-headline-lg font-bold text-on-surface">مجموعات التعلم الأكاديمية</h1>
        <p class="font-body-md text-body-md text-on-surface-variant mt-1">قم بإنشاء مجموعات دراسية جديدة وتعيين المعلمين والمواد الخاصة بها بكفاءة وسهولة.</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          (click)="openAddModal.emit()"
          type="button"
          class="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-lg hover:bg-primary-container transition-colors active:scale-95 focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
        >
          <mat-icon class="text-[18px]">add</mat-icon>
          <span class="font-label-md text-label-md font-semibold">إضافة مجموعة جديدة</span>
        </button>
      </div>
    </div>
  `
})
export class StudyGroupsHeaderComponent {
  openAddModal = output<void>();
}
