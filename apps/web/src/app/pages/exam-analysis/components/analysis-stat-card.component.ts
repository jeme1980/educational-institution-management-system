import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-analysis-stat-card',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
      <div class="mb-2 flex items-start justify-between gap-2">
        <span class="text-xs font-bold text-slate-500">{{ label() }}</span>
        <span class="grid h-8 w-8 place-items-center rounded-lg" [style.background]="color() + '18'" [style.color]="color()">
          <mat-icon class="text-lg">{{ icon() }}</mat-icon>
        </span>
      </div>
      <div class="text-xl font-black text-slate-900">{{ value() }}</div>
      @if (hint()) { <div class="mt-1 text-[10px] text-slate-400">{{ hint() }}</div> }
    </div>
  `,
})
export class AnalysisStatCardComponent {
  label = input.required<string>();
  value = input.required<string | number>();
  icon = input('analytics');
  color = input('#00236f');
  hint = input('');
}
