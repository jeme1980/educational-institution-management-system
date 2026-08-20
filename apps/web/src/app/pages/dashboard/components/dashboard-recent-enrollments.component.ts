import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStats } from '../../../core/models/api.models';

@Component({
  selector: 'app-dashboard-recent-enrollments',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-black text-slate-900">آخر عمليات التسجيل والقيد</h2>
      @if (rows.length) {
        <div class="mt-4 overflow-x-auto"><table class="w-full text-right text-xs"><thead class="border-b border-slate-100 text-slate-500"><tr><th class="px-3 py-3">الطالب</th><th class="px-3 py-3">الشعبة</th><th class="px-3 py-3">الطبقة</th><th class="px-3 py-3">الحالة</th><th class="px-3 py-3">التاريخ</th></tr></thead><tbody>@for (row of rows; track row.id) {<tr class="border-b border-slate-50"><td class="px-3 py-3 font-bold text-slate-800">{{ row.studentName }}</td><td class="px-3 py-3 text-slate-600">{{ row.className }}</td><td class="px-3 py-3 text-slate-600">{{ row.gradeLabel }}</td><td class="px-3 py-3"><span class="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{{ row.statusName }}</span></td><td class="px-3 py-3 text-slate-500">{{ row.createdAt | date:'shortDate' }}</td></tr>}</tbody></table></div>
      } @else { <div class="flex h-32 items-center justify-center text-xs text-slate-400">لا توجد عمليات تسجيل حديثة</div> }
    </section>
  `,
})
export class DashboardRecentEnrollmentsComponent { @Input() rows: DashboardStats['recentEnrollments'] = []; }
