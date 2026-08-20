import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStats } from '../../../core/models/api.models';

@Component({
  selector: 'app-dashboard-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-black text-slate-900">تطور أعداد الطلاب عبر السنوات الدراسية</h2>
      @if (data.length) {
        <svg class="mt-5 h-48 w-full overflow-visible" viewBox="0 0 600 220" preserveAspectRatio="none">
          <path d="M 0 195 H 600" stroke="#e2e8f0" stroke-width="1" />
          <path [attr.d]="linePath" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          @for (point of points; track point.yearLabel) { <circle [attr.cx]="point.x" [attr.cy]="point.y" r="5" fill="#fff" stroke="#2563eb" stroke-width="3" /><text [attr.x]="point.x" y="216" text-anchor="middle" font-size="11" fill="#64748b">{{ point.yearLabel }}</text><text [attr.x]="point.x" [attr.y]="point.y - 10" text-anchor="middle" font-size="11" fill="#0f172a">{{ point.count }}</text> }
        </svg>
      } @else { <div class="flex h-48 items-center justify-center text-xs text-slate-400">لا يوجد سجل تاريخي للطلاب</div> }
    </section>
  `,
})
export class DashboardLineChartComponent {
  @Input() data: DashboardStats['enrollmentTrend'] = [];
  get points() { const max = Math.max(...this.data.map((item) => item.count), 1); const width = this.data.length > 1 ? 560 / (this.data.length - 1) : 300; return this.data.map((item, index) => ({ ...item, x: this.data.length > 1 ? index * width + 20 : 300, y: 195 - (item.count / max) * 155 })); }
  get linePath(): string { return this.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '); }
}
