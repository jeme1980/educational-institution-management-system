import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-staff-header',
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
      <div>
        <h1 class="font-headline-lg text-headline-lg font-bold text-on-surface">إدارة الكادر والتعيينات</h1>
        <p class="font-body-md text-body-md text-on-surface-variant mt-1">عرض وإدارة السجلات الوظيفية والتعيينات الأكاديمية لطاقم التدريس والإدارة.</p>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <button
          (click)="exportList.emit()"
          type="button"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-border bg-surface text-on-surface-variant hover:bg-surface-container-low transition-colors font-medium text-xs active:scale-95 cursor-pointer"
        >
          <mat-icon class="text-[18px]">download</mat-icon>
          <span>تصدير القائمة</span>
        </button>
        
        @if (activeTab() === 'staff_members') {
          <button
            (click)="openAddModal.emit()"
            type="button"
            class="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-lg hover:bg-primary-container transition-colors active:scale-95 focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
          >
            <mat-icon class="text-[18px]">add</mat-icon>
            <span class="font-label-md text-label-md font-semibold">إضافة موظف جديد</span>
          </button>
        } @else {
          <button
            (click)="openAddAssignmentModal.emit()"
            type="button"
            class="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-lg hover:bg-primary-container transition-colors active:scale-95 focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
          >
            <mat-icon class="text-[18px]">add_task</mat-icon>
            <span class="font-label-md text-label-md font-semibold">إضافة تعيين جديد</span>
          </button>
        }
      </div>
    </div>
  `
})
export class StaffHeaderComponent {
  activeTab = input<'staff_members' | 'staff_assignments'>('staff_members');
  exportList = output<void>();
  openAddModal = output<void>();
  openAddAssignmentModal = output<void>();
}
