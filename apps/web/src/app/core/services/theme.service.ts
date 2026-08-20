import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storageKey = 'academic-core-theme';
  readonly theme = signal<AppTheme>(this.readStoredTheme());
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    effect(() => this.applyTheme(this.theme()));
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
    this.persist(theme);
  }

  toggleTheme(): void {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }

  private readStoredTheme(): AppTheme {
    if (typeof window === 'undefined') return 'light';
    try {
      return window.localStorage.getItem(this.storageKey) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private persist(theme: AppTheme): void {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(this.storageKey, theme); } catch { /* Storage can be unavailable in privacy mode. */ }
  }

  private applyTheme(theme: AppTheme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
    this.document.documentElement.style.colorScheme = theme;
  }
}
