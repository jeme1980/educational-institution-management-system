import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-empty-state',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <section
      class="ui-empty-state"
      [class.ui-empty-state--compact]="compact()"
      role="status"
      [attr.aria-label]="ariaLabel() || title() || null">
      @if (icon()) { <mat-icon aria-hidden="true">{{ icon() }}</mat-icon> }
      @if (title()) { <h3>{{ title() }}</h3> }
      @if (description()) { <p>{{ description() }}</p> }
      <div class="ui-empty-state__actions"><ng-content select="[ui-empty-action]" /></div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .ui-empty-state {
      display: flex;
      min-height: 12rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-12) var(--space-4);
      color: var(--on-surface-variant);
      text-align: center;
    }
    .ui-empty-state--compact { min-height: 8rem; padding-block: var(--space-8); }
    .ui-empty-state mat-icon { color: var(--outline); font-size: var(--space-12); height: var(--space-12); width: var(--space-12); }
    .ui-empty-state h3 { margin: var(--space-1) 0 0; color: var(--on-surface); font-size: var(--text-headline-sm); font-weight: var(--font-bold); }
    .ui-empty-state p { max-width: 32rem; margin: 0; color: var(--on-surface-variant); font-size: var(--text-body-sm); }
    .ui-empty-state__actions { display: flex; margin-top: var(--space-2); gap: var(--space-2); }
  `],
})
export class UiEmptyStateComponent {
  readonly title = input('');
  readonly description = input('');
  readonly icon = input('');
  readonly ariaLabel = input('');
  readonly compact = input(false);
}
