import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, effect, inject, input, output } from '@angular/core';

export type UiModalSize = 'sm' | 'md' | 'lg';

/**
 * Inputs:
 * - open: controls whether the modal is visible.
 * - title: optional accessible title shown in the default header.
 * - closeOnBackdrop: closes when the backdrop is clicked.
 * - closeOnEscape: closes when Escape is pressed.
 * Content slots:
 * - [ui-modal-header]: replaces the default header content.
 * - [ui-modal-body]: modal body content.
 * - [ui-modal-footer]: modal footer actions.
 */
@Component({
  selector: 'ui-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="ui-modal__backdrop" tabindex="-1" (click)="onBackdropClick($event)" (keydown)="onBackdropKeydown($event)">
        <section
          #dialog
          class="ui-modal"
          [class.ui-modal--sm]="size() === 'sm'"
          [class.ui-modal--md]="size() === 'md'"
          [class.ui-modal--lg]="size() === 'lg'"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          [attr.aria-labelledby]="title() ? titleId : null"
          [attr.aria-describedby]="description() ? descriptionId : null"
          (click)="$event.stopPropagation()"
          (keydown)="onDialogKeydown($event)"
        >
          <header class="ui-modal__header">
            <ng-content select="[ui-modal-header]"></ng-content>
            @if (title()) {
              <h2 [id]="titleId">{{ title() }}</h2>
            }
            <button class="ui-modal__close" type="button" aria-label="إغلاق" (click)="closed.emit()">×</button>
          </header>
          @if (description()) {
            <p class="ui-modal__description" [id]="descriptionId">{{ description() }}</p>
          }
          <div class="ui-modal__body"><ng-content select="[ui-modal-body]"></ng-content></div>
          <footer class="ui-modal__footer"><ng-content select="[ui-modal-footer]"></ng-content></footer>
        </section>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .ui-modal__backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: var(--space-4);
      background: rgb(15 23 42 / 0.62);
      direction: rtl;
    }

    .ui-modal {
      display: grid;
      width: min(100%, 42rem);
      max-height: 90vh;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
      border: 1px solid var(--color-neutral-100);
      border-radius: var(--radius-lg);
      background: var(--color-neutral-50);
      color: var(--color-neutral-900);
      box-shadow: var(--shadow-lg);
      animation: ui-modal-enter var(--transition-normal) ease-out both;
    }

    .ui-modal--sm { width: min(100%, 28rem); }
    .ui-modal--lg { width: min(100%, 64rem); }

    .ui-modal__header,
    .ui-modal__footer {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
    }

    .ui-modal__header { justify-content: space-between; border-bottom: 1px solid var(--color-neutral-100); }
    .ui-modal__description { margin: 0; padding: var(--space-3) var(--space-5) 0; color: var(--on-surface-variant); font-size: var(--text-body-sm); line-height: 1.6; }
    .ui-modal__header h2 { margin: 0; font-size: var(--font-lg); font-weight: var(--font-bold); }
    .ui-modal__body { min-height: 0; overflow: auto; padding: var(--space-5); }
    .ui-modal__footer { justify-content: flex-start; border-top: 1px solid var(--color-neutral-100); }

    .ui-modal__close {
      display: inline-grid;
      width: var(--space-8);
      height: var(--space-8);
      place-items: center;
      flex: 0 0 auto;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-neutral-500);
      font: inherit;
      font-size: var(--font-xl);
      line-height: 1;
      cursor: pointer;
    }

    .ui-modal__close:hover { background: var(--color-neutral-100); color: var(--color-neutral-900); }
    .ui-modal__close:focus-visible { outline: var(--space-1) solid var(--color-primary-500); outline-offset: var(--space-1); }

    @keyframes ui-modal-enter { from { opacity: 0; transform: translateY(var(--space-3)) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

    @media (max-width: 640px) {
      .ui-modal__backdrop { align-items: end; padding: 0; }
      .ui-modal { width: 100%; max-height: 94vh; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
    }
  `],
})
export class UiModalComponent implements OnDestroy {
  private static nextId = 0;
  private static scrollLockCount = 0;
  private static previousBodyOverflow: string | null = null;

  private readonly document = inject(DOCUMENT);
  private readonly instanceId = ++UiModalComponent.nextId;

  @ViewChild('dialog') private dialogRef?: ElementRef<HTMLElement>;

  readonly open = input(false);
  readonly title = input('');
  readonly description = input('');
  readonly size = input<UiModalSize>('md');
  readonly closeOnBackdrop = input(true);
  readonly closeOnEscape = input(true);
  readonly closed = output<void>();
  readonly titleId = `ui-modal-title-${this.instanceId}`;
  readonly descriptionId = `ui-modal-description-${this.instanceId}`;

  private previousActiveElement: HTMLElement | null = null;
  private isActive = false;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly focusEffect = effect(() => {
    const isOpen = this.open();
    if (isOpen && !this.isActive) {
      this.previousActiveElement = this.document.activeElement as HTMLElement | null;
      this.isActive = true;
      this.lockBodyScroll();
      this.scheduleFocus();
    } else if (!isOpen && this.isActive) {
      this.isActive = false;
      this.unlockBodyScroll();
      this.scheduleRestoreFocus();
    }
  });

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.open() && this.closeOnEscape()) this.closed.emit();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = this.getFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      this.dialogRef?.nativeElement.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || !this.dialogRef?.nativeElement.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !this.dialogRef?.nativeElement.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.closeOnBackdrop()) this.closed.emit();
  }

  onBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.closeOnEscape()) {
      event.stopPropagation();
      this.closed.emit();
    }
  }

  ngOnDestroy(): void {
    if (this.focusTimer) clearTimeout(this.focusTimer);
    if (this.isActive) this.unlockBodyScroll();
    this.restoreFocus();
    this.focusEffect.destroy();
  }

  private scheduleFocus(): void {
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      if (this.open()) this.focusInitialElement();
    });
  }

  private scheduleRestoreFocus(): void {
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      this.restoreFocus();
    });
  }

  private focusInitialElement(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;
    const target = dialog.querySelector<HTMLElement>('[autofocus]:not([disabled])') ?? this.getFocusableElements()[0] ?? dialog;
    target.focus({ preventScroll: true });
  }

  private getFocusableElements(): HTMLElement[] {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return [];
    return Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'))
      .filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
  }

  private restoreFocus(): void {
    const previous = this.previousActiveElement;
    this.previousActiveElement = null;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }

  private lockBodyScroll(): void {
    if (UiModalComponent.scrollLockCount++ === 0) {
      UiModalComponent.previousBodyOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
    }
  }

  private unlockBodyScroll(): void {
    if (UiModalComponent.scrollLockCount === 0) return;
    UiModalComponent.scrollLockCount -= 1;
    if (UiModalComponent.scrollLockCount === 0) {
      this.document.body.style.overflow = UiModalComponent.previousBodyOverflow ?? '';
      UiModalComponent.previousBodyOverflow = null;
    }
  }
}
