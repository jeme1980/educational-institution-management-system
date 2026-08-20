import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-institutions-header',
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
      <div>
        <span class="text-[11px] font-extrabold text-[#00236f] bg-[#00236f]/5 px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">الهيكل التنظيمي للمنظومة</span>
        <h1 class="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">إدارة المؤسسات والمدارس</h1>
        <p class="text-xs md:text-sm text-slate-500 mt-1">إدارة كافة المؤسسات والمدارس المسجلة وتخصيص هويتها البصرية وتحديد تفاصيل التواصل والموقع الجغرافي لكل منها.</p>
      </div>
      <button
        type="button"
        (click)="openAddModal.emit()"
        class="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#00236f] hover:bg-[#1e3a8a] text-white px-5 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer font-bold text-xs"
      >
        <mat-icon class="text-[18px]">add_circle</mat-icon>
        <span>إضافة مؤسسة جديدة</span>
      </button>
    </div>
  `
})
export class InstitutionsHeaderComponent {
  openAddModal = output<void>();
}
