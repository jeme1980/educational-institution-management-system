import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ui-page-header" dir="rtl">
      <div class="ui-page-header__copy">
        @if (eyebrow()) { <div class="ui-page-header__eyebrow">{{ eyebrow() }}</div> }
        <h1>{{ title() }}</h1>
        @if (description()) { <p>{{ description() }}</p> }
      </div>
      <div class="ui-page-header__actions"><ng-content select="[ui-page-actions]" /></div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .ui-page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-6);
      padding-block: var(--space-2);
    }
    .ui-page-header__copy { min-width: 0; }
    .ui-page-header__eyebrow { margin-bottom: var(--space-2); color: var(--primary); font-size: var(--font-xs); font-weight: var(--font-semibold); }
    .ui-page-header h1 { margin: 0; color: var(--on-surface); font-size: var(--text-headline-lg); font-weight: var(--font-bold); line-height: 1.2; }
    .ui-page-header p { max-width: 48rem; margin: var(--space-2) 0 0; color: var(--on-surface-variant); font-size: var(--text-body-sm); line-height: 1.6; }
    .ui-page-header__actions { display: flex; flex: 0 0 auto; align-items: center; gap: var(--space-2); }
    @media (max-width: 720px) {
      .ui-page-header { flex-direction: column; gap: var(--space-4); }
      .ui-page-header__actions { width: 100%; flex-wrap: wrap; }
    }
  `],
})
export class UiPageHeaderComponent {
  readonly title = input('');
  readonly description = input('');
  readonly eyebrow = input('');
}
