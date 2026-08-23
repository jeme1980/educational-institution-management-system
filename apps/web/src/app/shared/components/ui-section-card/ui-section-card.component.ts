import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-section-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-section-card" dir="rtl">
      @if (title() || description() || count()) {
        <header class="ui-section-card__header">
          <div class="ui-section-card__copy">
            @if (title()) { <h2>{{ title() }}</h2> }
            @if (description()) { <p>{{ description() }}</p> }
          </div>
          @if (count()) { <span class="ui-section-card__count">{{ count() }}</span> }
          <div class="ui-section-card__actions"><ng-content select="[ui-section-actions]" /></div>
        </header>
      }
      <div class="ui-section-card__content"><ng-content /></div>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .ui-section-card { overflow: hidden; border: 1px solid var(--outline-variant); border-radius: var(--radius-lg); background: var(--surface-container-lowest); }
    .ui-section-card__header { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--outline-variant); }
    .ui-section-card__copy { min-width: 0; flex: 1 1 auto; }
    .ui-section-card h2 { margin: 0; color: var(--on-surface); font-size: var(--font-md); font-weight: var(--font-bold); }
    .ui-section-card p { margin: var(--space-1) 0 0; color: var(--on-surface-variant); font-size: var(--font-xs); }
    .ui-section-card__count { display: inline-flex; min-height: var(--space-6); align-items: center; border-radius: var(--radius-full); background: var(--secondary-container); color: var(--on-secondary); padding-inline: var(--space-3); font-size: var(--font-xs); font-weight: var(--font-semibold); white-space: nowrap; }
    .ui-section-card__actions { display: inline-flex; align-items: center; gap: var(--space-2); }
    .ui-section-card__content { min-width: 0; }
    @media (max-width: 640px) { .ui-section-card__header { align-items: flex-start; flex-wrap: wrap; } .ui-section-card__actions { width: 100%; } }
  `],
})
export class UiSectionCardComponent {
  readonly title = input('');
  readonly description = input('');
  readonly count = input<string | number>('');
}
