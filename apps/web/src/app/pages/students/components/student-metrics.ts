import { ChangeDetectionStrategy, Component, OnInit, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-metrics',
  imports: [MatIconModule, UiStatCardComponent],
  templateUrl: './student-metrics.html',
  styles: [`
    :host { display: block; min-width: 0; }
    .student-metrics__toolbar { display: flex; justify-content: flex-start; min-height: var(--space-8); }
    .student-metrics__toggle { display: inline-flex; width: var(--space-8); height: var(--space-8); align-items: center; justify-content: center; border: 1px solid var(--outline-variant); border-radius: var(--radius-md); background: var(--surface-container-low); color: var(--on-surface); cursor: pointer; transition: background-color var(--transition-fast) ease, border-color var(--transition-fast) ease; }
    .student-metrics__toggle:hover { background: var(--surface-container-high); border-color: var(--outline); }
    .student-metrics__toggle:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .student-metrics__toggle mat-icon { font-size: var(--space-5); }
    .student-metrics__summary { display: flex; min-height: var(--space-10); align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px solid var(--outline-variant); border-radius: var(--radius-lg); background: var(--surface-container-lowest); color: var(--on-surface); font-size: var(--font-sm); font-weight: var(--font-semibold); }
    @media (max-width: 767px) {
      .student-metrics__summary { flex-wrap: wrap; }
    }
    @media (prefers-reduced-motion: reduce) {
      .student-metrics__toggle { transition: none; }
    }
  `],
})
export class StudentMetrics implements OnInit {
  private static readonly COLLAPSED_STORAGE_KEY = 'students-metrics-collapsed';
  readonly collapsed = signal(false);
  totalCount = input<number>(0);
  activeCount = input<number>(0);
  filteredCount = input<number>(0);
  guardiansCount = input<number>(0);

  ngOnInit(): void {
    try {
      this.collapsed.set(window.localStorage.getItem(StudentMetrics.COLLAPSED_STORAGE_KEY) === 'true');
    } catch {
      this.collapsed.set(false);
    }
  }

  toggleCollapsed(): void {
    const collapsed = !this.collapsed();
    this.collapsed.set(collapsed);
    try {
      window.localStorage.setItem(StudentMetrics.COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }
}
