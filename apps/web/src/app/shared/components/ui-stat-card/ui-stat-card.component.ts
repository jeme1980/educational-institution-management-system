import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type UiStatTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

@Component({
  selector: 'ui-stat-card',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ui-stat-card">
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
    .ui-stat-card__icon { display: grid; inline-size: var(--space-10); block-size: var(--space-10); aspect-ratio: 1; flex: 0 0 auto; place-items: center; border-radius: var(--radius-md); background: var(--stat-icon-surface); color: var(--stat-icon-foreground); }
    .ui-stat-card__icon mat-icon { inline-size: var(--space-5); block-size: var(--space-5); font-size: var(--space-5); line-height: var(--space-5); }
    .ui-stat-card__label, .ui-stat-card__helper { color: var(--on-surface-variant); font-size: var(--font-xs); }
    .ui-stat-card__value { margin-top: var(--space-1); color: var(--on-surface); font-size: var(--text-headline-md); font-weight: var(--font-bold); line-height: 1.1; }
  `],
})
export class UiStatCardComponent {
  readonly label = input('');
  readonly value = input<string | number>('');
  readonly helper = input('');
  readonly icon = input('');
  readonly tone = input<UiStatTone>('neutral');
}
