import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard-stats-card',
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex items-center justify-between">
      <div>
        <p class="text-xs font-semibold text-slate-500 mb-1">{{ title() }}</p>
        <h3 class="text-2xl font-black text-slate-900 tracking-tight">{{ value() }}</h3>
        @if (subtitle()) {
          <p class="text-[11px] text-slate-400 mt-1">{{ subtitle() }}</p>
        }
      </div>
      <div [class]="'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ' + bgClass()">
        <mat-icon [class]="'text-2xl ' + iconClass()">{{ icon() }}</mat-icon>
      </div>
    </div>
  `
})
export class DashboardStatsCardComponent {
  title = input.required<string>();
  value = input.required<number | string>();
  icon = input.required<string>();
  subtitle = input<string>();
  bgClass = input<string>('bg-blue-50');
  iconClass = input<string>('text-blue-600');
}
