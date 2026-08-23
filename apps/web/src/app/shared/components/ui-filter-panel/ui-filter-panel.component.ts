import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'ui-filter-panel',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-filter-panel" dir="rtl">
      @if (title() || resetLabel()) {
        <div class="ui-filter-panel__header">
          <div class="ui-filter-panel__title">@if (icon()) { <mat-icon aria-hidden="true">{{ icon() }}</mat-icon> }<span>{{ title() }}</span></div>
          @if (resetLabel()) { <button type="button" class="ui-filter-panel__reset" (click)="reset.emit()">{{ resetLabel() }}</button> }
        </div>
      }
      <div class="ui-filter-panel__content"><ng-content /></div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .ui-filter-panel { border: 1px solid var(--outline-variant); border-radius: var(--radius-lg); background: var(--surface-container-lowest); padding: var(--space-5); }
    .ui-filter-panel__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--outline-variant); }
    .ui-filter-panel__title { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--on-surface); font-size: var(--font-sm); font-weight: var(--font-semibold); }
    .ui-filter-panel__title mat-icon { color: var(--primary); font-size: var(--space-5); }
    .ui-filter-panel__reset { border: 0; background: transparent; color: var(--primary); padding: 0; font: inherit; font-size: var(--font-xs); font-weight: var(--font-semibold); cursor: pointer; }
    .ui-filter-panel__reset:hover { color: var(--primary-hover); }
    .ui-filter-panel__reset:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset); }
  `],
})
export class UiFilterPanelComponent {
  readonly title = input('');
  readonly icon = input('');
  readonly resetLabel = input('');
  readonly reset = output<void>();
}
