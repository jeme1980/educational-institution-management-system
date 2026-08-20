import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';

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
      <div class="ui-modal__backdrop" (click)="onBackdropClick($event)">
        <section
          class="ui-modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="title() ? titleId : null"
          (click)="$event.stopPropagation()"
        >
          <header class="ui-modal__header">
            <ng-content select="[ui-modal-header]"></ng-content>
            @if (title()) {
              <h2 [id]="titleId">{{ title() }}</h2>
            }
            <button class="ui-modal__close" type="button" aria-label="إغلاق" (click)="closed.emit()">×</button>
          </header>
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

    .ui-modal__header,
    .ui-modal__footer {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
    }

    .ui-modal__header { justify-content: space-between; border-bottom: 1px solid var(--color-neutral-100); }
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
export class UiModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly closeOnBackdrop = input(true);
  readonly closeOnEscape = input(true);
  readonly closed = output<void>();
  readonly titleId = 'ui-modal-title';

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open() && this.closeOnEscape()) this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.closeOnBackdrop()) this.closed.emit();
  }
}
