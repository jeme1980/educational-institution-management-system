import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-header',
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-5">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>إعدادات النظام</span>
          <mat-icon class="text-xs">chevron_left</mat-icon>
          <span class="text-slate-800 font-medium">{{ title() }}</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <mat-icon class="text-[#00236f]">{{ icon() }}</mat-icon>
          <span>{{ title() }}</span>
        </h1>
        @if (subtitle()) {
          <p class="text-xs text-slate-500 mt-1">{{ subtitle() }}</p>
        }
      </div>
    </div>
  `
})
export class SettingsHeaderComponent {
  title = input.required<string>();
  icon = input<string>('settings');
  subtitle = input<string>();
}
