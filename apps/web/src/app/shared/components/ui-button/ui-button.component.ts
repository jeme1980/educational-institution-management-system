import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Inputs:
 * - variant: primary, secondary, danger, or ghost.
 * - size: sm, md, or lg.
 * - loading: shows a busy state and prevents activation.
 * - disabled: prevents activation.
 * - type: native button type.
 * Content is projected as the button label and optional icon/content.
 */
@Component({
  selector: 'ui-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="ui-button"
      [class]="'ui-button ui-button--' + variant() + ' ui-button--' + size()"
      [attr.type]="type()"
      [attr.form]="form() || null"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading()"
      [attr.aria-label]="ariaLabel() || null"
      (click)="activated.emit($event)"
    >
      @if (loading()) {
        <span class="ui-button__spinner" aria-hidden="true"></span>
        <span class="ui-button__loading-label">جارٍ التنفيذ...</span>
      } @else {
        <ng-content></ng-content>
      }
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }

    .ui-button {
      display: inline-flex;
      min-height: var(--space-10);
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      border: 1px solid transparent;
      border-radius: var(--radius-default);
      padding-inline: var(--space-4);
      padding-block: var(--space-2);
      font: inherit;
      font-size: var(--font-sm);
      font-weight: var(--font-semibold);
      line-height: 1.25;
      cursor: pointer;
      transition: background-color var(--transition-fast) var(--ease-standard), border-color var(--transition-fast) var(--ease-standard), color var(--transition-fast) var(--ease-standard), box-shadow var(--transition-fast) var(--ease-standard);
    }

    .ui-button:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }

    .ui-button:disabled { cursor: not-allowed; opacity: 0.62; }

    .ui-button--sm { min-height: var(--space-8); padding-inline: var(--space-3); font-size: var(--font-xs); }
    .ui-button--md { min-height: var(--space-10); }
    .ui-button--lg { min-height: var(--space-12); padding-inline: var(--space-5); font-size: var(--font-md); }

    .ui-button--primary { background: var(--primary); color: var(--on-primary); }
    .ui-button--primary:hover:not(:disabled) { background: var(--primary-hover); }

    .ui-button--secondary { border-color: var(--border); background: var(--surface-elevated); color: var(--primary); }
    .ui-button--secondary:hover:not(:disabled) { background: var(--hover-surface); }

    .ui-button--danger { background: var(--danger); color: var(--on-primary); }
    .ui-button--danger:hover:not(:disabled) { background: var(--color-danger-900); }

    .ui-button--ghost { background: transparent; color: var(--text-secondary); }
    .ui-button--ghost:hover:not(:disabled) { background: var(--hover-surface); color: var(--on-surface); }

    .ui-button__spinner {
      width: var(--space-4);
      height: var(--space-4);
      border: var(--space-1) solid currentColor;
      border-inline-end-color: transparent;
      border-radius: var(--radius-full);
      animation: ui-button-spin var(--transition-normal) linear infinite;
    }

    @keyframes ui-button-spin { to { transform: rotate(360deg); } }
  `],
})
export class UiButtonComponent {
  readonly variant = input<'primary' | 'secondary' | 'danger' | 'ghost'>('primary');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly form = input('');
  readonly ariaLabel = input('');
  readonly activated = output<MouseEvent>();
}
