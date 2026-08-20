import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStats } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-dashboard-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div><p class="mb-1 text-[11px] font-bold text-blue-600">التوزيع الأكاديمي</p><h2 class="text-sm font-black text-slate-900">توزيع الطلاب حسب المرحلة والطبقة</h2></div>
        <span class="rounded-lg bg-blue-50 p-2 text-blue-700" aria-hidden="true">▥</span>
      </div>
      @if (sortedData.length) {
        <div class="bar-chart" dir="rtl">
          <div class="bar-chart__y-axis" aria-hidden="true"><span>{{ maxCount }}</span><span>{{ halfMax }}</span><span>0</span></div>
          <div class="bar-chart__plot">
            <div class="bar-chart__gridline bar-chart__gridline--top"></div><div class="bar-chart__gridline bar-chart__gridline--middle"></div><div class="bar-chart__gridline bar-chart__gridline--bottom"></div>
            <div class="bar-chart__columns">
              @for (item of sortedData; track item.id) {
                <div class="bar-chart__column" [title]="item.stage + ' - ' + item.label + ': ' + item.count">
                  <span class="bar-chart__value">{{ item.count }}</span>
                  <div class="bar-chart__bar" [style.height.%]="barHeight(item.count)"></div>
                  <span class="bar-chart__label">{{ item.label }}</span>
                </div>
              }
            </div>
            <div class="bar-chart__x-axis-label">اسم الطبقة</div>
          </div>
        </div>
      } @else {
        <div class="flex h-64 flex-col items-center justify-center text-slate-400"><span class="text-3xl">—</span><p class="mt-2 text-xs">لا توجد بيانات طلاب للعرض</p></div>
      }
      <p class="mt-2 text-center text-[11px] font-semibold text-slate-400">المحور الرأسي: عدد الطلاب</p>
    </section>
  `,
  styles: [`
    .bar-chart { display:flex; min-height:18rem; gap:.65rem; padding-top:.75rem; }
    .bar-chart__y-axis { display:flex; width:2rem; flex:0 0 2rem; flex-direction:column; justify-content:space-between; padding-block:.15rem 2.8rem; color:#94a3b8; font-size:.65rem; text-align:left; }
    .bar-chart__plot { position:relative; min-width:0; flex:1; padding-bottom:2.8rem; }
    .bar-chart__columns { position:relative; z-index:1; display:flex; height:15rem; align-items:flex-end; gap:clamp(.5rem,2vw,1.2rem); overflow-x:auto; padding:0 .35rem; }
    .bar-chart__column { display:flex; min-width:3rem; height:100%; flex:1; flex-direction:column; align-items:center; justify-content:flex-end; gap:.4rem; }
    .bar-chart__value { min-height:1rem; color:#1e3a5f; font-size:.68rem; font-weight:800; }
    .bar-chart__bar { width:min(3.25rem,72%); min-height:.35rem; border-radius:.55rem .55rem .18rem .18rem; background:linear-gradient(180deg,#2f80c9 0%,#1455a0 100%); box-shadow:0 .35rem .65rem rgb(20 85 160 / .16); transition:height .3s ease,filter .2s ease; }
    .bar-chart__column:hover .bar-chart__bar { filter:brightness(1.1); }
    .bar-chart__label { width:5.25rem; overflow:hidden; color:#64748b; font-size:.68rem; text-align:center; text-overflow:ellipsis; white-space:nowrap; }
    .bar-chart__gridline { position:absolute; inset-inline:0; border-top:1px dashed #e2e8f0; }
    .bar-chart__gridline--top { top:0; }.bar-chart__gridline--middle { top:50%; }.bar-chart__gridline--bottom { bottom:2.8rem; }
    .bar-chart__x-axis-label { position:absolute; inset-inline:0; bottom:0; color:#94a3b8; font-size:.65rem; font-weight:700; text-align:center; }
    @media (max-width:520px) { .bar-chart__columns { gap:.35rem; }.bar-chart__column { min-width:2.8rem; }.bar-chart__label { width:4.5rem; font-size:.62rem; } }
  `],
})
export class DashboardBarChartComponent {
  private readonly apiService = inject(ApiService);
  @Input() data: DashboardStats['studentsByGrade'] = [];
  get sortedData(): DashboardStats['studentsByGrade'] { return [...this.data].sort((a, b) => this.compareAcademicLabels(a, b)); }
  get maxCount(): number { return Math.max(...this.sortedData.map((item) => item.count), 1); }
  get halfMax(): number { return Math.round(this.maxCount / 2); }
  barHeight(count: number): number { return Math.max(3, Math.round((count / this.maxCount) * 100)); }
  private compareAcademicLabels(a: DashboardStats['studentsByGrade'][number], b: DashboardStats['studentsByGrade'][number]): number {
    const codeOrder = this.codeNumber(a) - this.codeNumber(b);
    if (codeOrder !== 0) return codeOrder;
    return a.label.localeCompare(b.label, 'ar');
  }
  private codeNumber(item: DashboardStats['studentsByGrade'][number]): number {
    return this.apiService.gradeLevels().find(level => level.id === item.id)?.codeNumber ?? Number.MAX_SAFE_INTEGER;
  }
}
