import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AcademicChartThemeService {
  private readonly themeRevision = signal(0);
  readonly revision = this.themeRevision.asReadonly();

  constructor() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => this.themeRevision.update(value => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
}
