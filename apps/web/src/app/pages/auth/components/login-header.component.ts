import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login-header',
  imports: [CommonModule, MatIconModule],
  template: `
    <header class="w-full max-w-7xl mx-auto px-6 py-4 flex justify-between items-center border-b border-stone-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-50">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white font-bold text-xl shadow-md border border-white/20">
          أ
        </div>
        <div>
          <h1 class="text-lg font-bold tracking-tight text-stone-900">
            {{ appTitle() }}
          </h1>
          <p class="text-xs text-stone-500">
            {{ appSubtitle() }}
          </p>
        </div>
      </div>

      <button 
        type="button"
        (click)="toggleLanguage.emit()" 
        class="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300/60 rounded-xl border border-stone-200 transition-all cursor-pointer"
      >
        <mat-icon class="text-sm">translate</mat-icon>
        <span>{{ isArabic() ? 'עברית' : 'العربية' }}</span>
      </button>
    </header>
  `
})
export class LoginHeaderComponent {
  appTitle = input<string>('');
  appSubtitle = input<string>('');
  isArabic = input<boolean>(true);
  toggleLanguage = output<void>();
}
