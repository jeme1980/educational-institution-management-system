import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-enrollments-header',
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-5">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>شؤون الطلاب</span>
          <mat-icon class="text-xs">chevron_left</mat-icon>
          <span class="text-slate-800 font-medium">سجلات التسجيل والانتساب</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <mat-icon class="text-[#00236f]">how_to_reg</mat-icon>
          <span>تسجيل الطلاب وتوزيع الصفوف</span>
        </h1>
      </div>

      <button
        (click)="openModal.emit()"
        type="button"
        class="px-4 py-2.5 rounded-xl bg-[#00236f] hover:bg-[#1e3a8a] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
      >
        <mat-icon class="text-sm">person_add</mat-icon>
        <span>تسجيل طالب جديد في صف</span>
      </button>
    </div>
  `
})
export class EnrollmentsHeaderComponent {
  openModal = output<void>();
}
