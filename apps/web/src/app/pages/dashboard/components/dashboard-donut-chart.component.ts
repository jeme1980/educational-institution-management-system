import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStats } from '../../../core/models/api.models';

@Component({
  selector: 'app-dashboard-donut-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-black text-slate-900">توزيع الطلاب حسب الجنس</h2>
      @if (total) {
        <div class="mt-5 flex items-center gap-6">
          <div class="relative h-36 w-36 shrink-0 rounded-full" [style.background]="gradient">
            <div class="absolute inset-5 flex items-center justify-center rounded-full bg-white text-center"><span class="text-2xl font-black text-slate-900">{{ total }}</span></div>
          </div>
          <div class="space-y-3">
            @for (item of data; track item.id; let index = $index) {
              <div class="flex items-center gap-2 text-xs"><span class="h-3 w-3 rounded-full" [class]="colors[index % colors.length]"></span><span class="text-slate-600">{{ item.label }}</span><strong class="text-slate-900">{{ item.count }}</strong></div>
            }
          </div>
        </div>
      } @else { <div class="flex h-36 items-center justify-center text-xs text-slate-400">لا توجد بيانات جنس للعرض</div> }
    </section>
  `,
})
export class DashboardDonutChartComponent {
  @Input() data: DashboardStats['studentsByGender'] = [];
  colors = ['bg-blue-500', 'bg-pink-500', 'bg-amber-500', 'bg-slate-400'];
  get total(): number { return this.data.reduce((sum, item) => sum + item.count, 0); }
  get gradient(): string {
    if (!this.total) return '#e2e8f0';
    let cursor = 0;
    const colors = ['#3b82f6', '#ec4899', '#f59e0b', '#94a3b8'];
    const stops = this.data.map((item, index) => { const start = cursor; cursor += (item.count / this.total) * 100; return `${colors[index % colors.length]} ${start}% ${cursor}%`; });
    return `conic-gradient(${stops.join(', ')})`;
  }
}
