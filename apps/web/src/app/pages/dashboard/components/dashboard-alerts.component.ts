import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStats } from '../../../core/models/api.models';

@Component({
  selector: 'app-dashboard-alerts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-black text-slate-900">تنبيهات تحتاج متابعة</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-amber-50 p-4"><p class="text-xs text-amber-800">طلاب بلا ولي أمر</p><strong class="mt-2 block text-2xl text-amber-900">{{ alerts.studentsWithoutGuardian }}</strong></div>
        <div class="rounded-xl bg-blue-50 p-4"><p class="text-xs text-blue-800">طلاب بلا ملف طبي</p><strong class="mt-2 block text-2xl text-blue-900">{{ alerts.studentsWithoutMedicalProfile }}</strong></div>
        <div class="rounded-xl bg-rose-50 p-4"><p class="text-xs text-rose-800">ذوو الاحتياجات الخاصة</p><strong class="mt-2 block text-2xl text-rose-900">{{ alerts.studentsWithSpecialNeeds }}</strong></div>
      </div>
    </section>
  `,
})
export class DashboardAlertsComponent { @Input() alerts: DashboardStats['alerts'] = { studentsWithoutGuardian: 0, studentsWithoutMedicalProfile: 0, studentsWithSpecialNeeds: 0 }; }
