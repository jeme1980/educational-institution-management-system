import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type UiStatTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

@Component({
  selector: 'ui-stat-card',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ui-stat-card" [class]="'ui-stat-card ui-stat-card--' + tone()" [class.ui-stat-card--compact]="compact()" [class.ui-stat-card--on-container-icon]="iconTreatment() === 'on-container'">
      @if (icon()) { <div class="ui-stat-card__icon"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon></div> }
      <div class="ui-stat-card__content">
        <div class="ui-stat-card__label">{{ label() }}</div>
        <div class="ui-stat-card__value">{{ value() }}</div>
        @if (helper()) { <div class="ui-stat-card__helper">{{ helper() }}</div> }
      </div>
    </article>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .ui-stat-card { display: flex; min-height: 6.5rem; align-items: center; gap: var(--space-4); padding: var(--space-4); border: 1px solid var(--outline-variant); border-radius: var(--radius-lg); background: var(--surface-container-lowest); }
    .ui-stat-card--compact { min-height: calc(var(--space-12) + var(--space-6)); gap: var(--space-3); padding: var(--space-3); }
    .ui-stat-card__icon { display: inline-flex; width: var(--space-10); height: var(--space-10); flex: 0 0 auto; align-items: center; justify-content: center; border-radius: var(--radius-md); background: var(--surface-container-low); color: var(--primary); }
    .ui-stat-card__icon mat-icon { font-size: var(--space-5); }
    .ui-stat-card--compact .ui-stat-card__icon { width: var(--space-8); height: var(--space-8); }
    .ui-stat-card--compact .ui-stat-card__icon mat-icon { font-size: var(--space-5); }
    .ui-stat-card__label, .ui-stat-card__helper { color: var(--on-surface-variant); font-size: var(--font-xs); }
    .ui-stat-card__value { margin-top: var(--space-1); color: var(--on-surface); font-size: var(--text-headline-md); font-weight: var(--font-bold); line-height: 1.1; }
    .ui-stat-card--primary .ui-stat-card__icon { background: var(--primary-container); color: var(--primary); }
    .ui-stat-card--on-container-icon .ui-stat-card__icon { background: var(--primary-container); color: var(--on-primary-container); }
    .ui-stat-card--success .ui-stat-card__icon { background: var(--success-container); color: var(--success); }
    .ui-stat-card--warning .ui-stat-card__icon { background: var(--warning-container); color: var(--warning); }
    .ui-stat-card--danger .ui-stat-card__icon { background: var(--danger-container); color: var(--danger); }
  `],
})
export class UiStatCardComponent {
  readonly label = input('');
  readonly value = input<string | number>('');
  readonly helper = input('');
  readonly icon = input('');
  readonly tone = input<UiStatTone>('neutral');
  readonly iconTreatment = input<'default' | 'on-container'>('default');
  readonly compact = input(false);
}
