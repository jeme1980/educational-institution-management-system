import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-staff-header',
  imports: [CommonModule, MatIconModule, UiButtonComponent, UiPageHeaderComponent],
  template: `
    <ui-page-header title="إدارة الكادر والتعيينات" description="عرض وإدارة السجلات الوظيفية والتعيينات الأكاديمية للطاقم التدريسي والإداري." eyebrow="الموارد البشرية">
      <div ui-page-actions class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <ui-button size="sm" variant="secondary" (activated)="exportList.emit()"><mat-icon icon class="text-base">download</mat-icon>تصدير القائمة</ui-button>
        @if (activeTab() === 'staff_members' && canCreate()) {
          <ui-button size="sm" variant="primary" (activated)="openAddModal.emit()"><mat-icon icon class="text-base">add</mat-icon>إضافة موظف جديد</ui-button>
        } @else if (canCreate()) {
          <ui-button size="sm" variant="primary" (activated)="openAddAssignmentModal.emit()"><mat-icon icon class="text-base">add_task</mat-icon>إضافة تعيين جديد</ui-button>
        }
      </div>
    </ui-page-header>

    <div class="legacy-staff-header hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
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
        
        @if (activeTab() === 'staff_members' && canCreate()) {
          <button
            (click)="openAddModal.emit()"
            type="button"
            class="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-lg hover:bg-primary-container transition-colors active:scale-95 focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
          >
            <mat-icon class="text-[18px]">add</mat-icon>
            <span class="font-label-md text-label-md font-semibold">إضافة موظف جديد</span>
          </button>
        } @else if (canCreate()) {
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
  canCreate = input(true);
}
