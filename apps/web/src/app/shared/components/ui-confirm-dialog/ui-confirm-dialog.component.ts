import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UiButtonComponent } from '../ui-button/ui-button.component';
import { UiModalComponent } from '../ui-modal/ui-modal.component';

/**
 * Inputs:
 * - open: controls whether the confirmation dialog is visible.
 * - title: short action-oriented dialog title.
 * - message: explanation of what will happen.
 * - confirmText: confirmation button label, defaults to "تأكيد".
 * - cancelText: cancellation button label, defaults to "إلغاء".
 * - variant: danger for irreversible deletion, warning for archive/reversible actions,
 *   or default for ordinary confirmations.
 * - loading: shows the shared button pending state and makes the confirmation non-dismissible.
 * Outputs:
 * - confirmed: emitted when the user confirms.
 * - cancelled: emitted when the user cancels, presses Escape, or clicks the backdrop.
 */
@Component({
  selector: 'ui-confirm-dialog',
  standalone: true,
  imports: [UiButtonComponent, UiModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-modal
      [open]="open()"
      [title]="title()"
      [dismissible]="!loading()"
      (closed)="onModalClosed()"
    >
      <div ui-modal-body class="confirm-dialog__content">
        @if (variant() !== 'default') {
          <div class="confirm-dialog__icon" [class.confirm-dialog__icon--danger]="variant() === 'danger'" [class.confirm-dialog__icon--warning]="variant() === 'warning'" aria-hidden="true">!</div>
        }
        <p class="confirm-dialog__message">{{ message() }}</p>
      </div>

      <div ui-modal-footer class="confirm-dialog__actions">
        <ui-button variant="ghost" type="button" [disabled]="loading()" (activated)="onCancel()">{{ cancelText() }}</ui-button>
        <ui-button [variant]="confirmButtonVariant()" type="button" [loading]="loading()" (activated)="onConfirm()">{{ confirmText() }}</ui-button>
      </div>
    </ui-modal>
  `,
  styles: [`
    :host { display: contents; }

    .confirm-dialog__content {
      display: grid;
      gap: var(--space-4);
      justify-items: center;
      text-align: center;
    }

    .confirm-dialog__icon {
      display: grid;
      width: var(--space-12);
      height: var(--space-12);
      place-items: center;
      border-radius: var(--radius-full);
      font-size: var(--font-xl);
      font-weight: var(--font-bold);
    }

    .confirm-dialog__icon--danger { background: var(--color-danger-100); color: var(--color-danger-700); }
    .confirm-dialog__icon--warning { background: var(--color-warning-100); color: var(--color-warning-700); }

    .confirm-dialog__message {
      max-width: 34rem;
      margin: 0;
      color: var(--color-neutral-700);
      font-size: var(--font-md);
      line-height: 1.8;
      white-space: pre-line;
    }

    .confirm-dialog__actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
  `],
})
export class UiConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly message = input('');
  readonly confirmText = input('تأكيد');
  readonly cancelText = input('إلغاء');
  readonly variant = input<'danger' | 'warning' | 'default'>('default');
  readonly loading = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  confirmButtonVariant(): 'danger' | 'secondary' | 'primary' {
    return this.variant() === 'danger' ? 'danger' : this.variant() === 'warning' ? 'secondary' : 'primary';
  }

  onConfirm(): void {
    if (!this.loading()) this.confirmed.emit();
  }

  onCancel(): void {
    if (!this.loading()) this.cancelled.emit();
  }

  onModalClosed(): void {
    if (!this.loading()) this.cancelled.emit();
  }
}
