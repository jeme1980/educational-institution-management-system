import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-exams-header',
  imports: [CommonModule, MatIconModule, RouterLink],
  template: `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-5 no-print">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>نظام إدارة المدرسة</span>
          <mat-icon class="text-xs">chevron_left</mat-icon>
          <span class="text-slate-800 font-medium">الامتحانات والتقييمات</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <mat-icon class="text-[#00236f]">assignment</mat-icon>
          <span>إدارة الامتحانات والتقييمات الأكاديمية</span>
        </h1>
        <p class="text-xs text-slate-500 mt-1">
          جدولة الامتحانات، بناء بنك الأسئلة والمهارات، رصد الدرجات وتحليل التمكن التشخيصي.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <a
          routerLink="/exam-analysis"
          class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-[#00236f] hover:bg-blue-100 transition-all text-xs font-bold shadow-2xs active:scale-95 cursor-pointer"
          title="فتح شاشة تحليل نتائج الامتحانات"
        >
          <mat-icon class="text-base">analytics</mat-icon>
          <span>تحليل الامتحان</span>
        </a>

        <button
          (click)="printTimetable.emit()"
          type="button"
          class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all text-xs font-semibold shadow-2xs active:scale-95 cursor-pointer"
          title="طباعة جدول الامتحانات"
        >
          <mat-icon class="text-base text-slate-500">print</mat-icon>
          <span>طباعة الجدول</span>
        </button>
        
        <button
          (click)="openAddModal.emit()"
          type="button"
          class="flex items-center gap-2 bg-[#00236f] hover:bg-[#1e3a8a] text-white px-4 py-2.5 rounded-xl transition-all shadow-xs text-xs font-bold active:scale-95 cursor-pointer"
        >
          <mat-icon class="text-base">add</mat-icon>
          <span>جدولة امتحان جديد</span>
        </button>
      </div>
    </div>
  `
})
export class ExamsHeaderComponent {
  printTimetable = output<void>();
  openAddModal = output<void>();
}
