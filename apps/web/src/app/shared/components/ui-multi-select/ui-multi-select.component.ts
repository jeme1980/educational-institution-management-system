import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export const MULTI_SELECT_ALL = 'ALL';

export interface UiMultiSelectOption {
  id: string;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'ui-multi-select',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="multi-select" [class.multi-select--open]="open()" [class.multi-select--disabled]="disabled">
      <button
        type="button"
        class="multi-select__trigger"
        [attr.aria-label]="ariaLabel"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [disabled]="disabled"
        (click)="toggleOpen()"
      >
        <span>{{ summary }}</span><mat-icon aria-hidden="true">expand_more</mat-icon>
      </button>
      @if (open()) {
        <fieldset class="multi-select__panel" role="listbox" aria-multiselectable="true" [attr.aria-label]="ariaLabel">
          <label class="multi-select__all" role="option" [attr.aria-selected]="isAll">
            <input type="checkbox" [checked]="isAll" (change)="selectAll()" /><span>{{ allLabel }}</span>
          </label>
          <div class="multi-select__options">
            @for (option of options; track option.id) {
              <label role="option" [attr.aria-selected]="isSelected(option.id)">
                <input type="checkbox" [checked]="isSelected(option.id)" [disabled]="option.disabled" (change)="toggle(option.id)" /><span>{{ option.label }}</span>
              </label>
            } @empty { <p>{{ emptyLabel }}</p> }
          </div>
        </fieldset>
      }
    </div>
  `,
  styles: [`
    :host { position:relative; display:block; min-width:0; }
    .multi-select { position:relative; }
    .multi-select--open { z-index:30; }
    .multi-select__trigger { display:flex; align-items:center; justify-content:space-between; gap:var(--space-2); width:100%; min-height:2.5rem; padding-inline:var(--space-3); border:1px solid var(--outline); border-radius:var(--radius-md); background:var(--surface-container-lowest); color:var(--on-surface); font:inherit; font-size:var(--font-sm); font-weight:var(--font-medium); text-align:start; cursor:pointer; }
    .multi-select__trigger:focus-visible { outline:var(--focus-ring-width) solid var(--focus-ring); outline-offset:var(--focus-ring-offset); }
    .multi-select__trigger mat-icon { color:var(--on-surface-variant); transition:transform 160ms ease; }
    .multi-select--open .multi-select__trigger mat-icon { transform:rotate(180deg); }
    .multi-select__panel { position:absolute; z-index:30; inset-inline:0; top:calc(100% + var(--space-1)); min-width:14rem; margin:0; padding:var(--space-2); border:1px solid var(--outline); border-radius:var(--radius-md); background:var(--surface-container-lowest); box-shadow:var(--shadow-md); }
    label { display:flex; align-items:center; gap:var(--space-2); min-height:2.5rem; padding-inline:var(--space-2); border-radius:var(--radius-sm); color:var(--on-surface); font-size:var(--font-sm); font-weight:var(--font-regular); cursor:pointer; }
    label:hover { background:var(--surface-container-low); }
    input { inline-size:1rem; block-size:1rem; accent-color:var(--primary); }
    .multi-select__all { border-bottom:1px solid var(--outline-variant); font-weight:var(--font-semibold); }
    .multi-select__options { max-height:16rem; overflow:auto; padding-block-start:var(--space-1); }
    p { margin:0; padding:var(--space-3); color:var(--on-surface-variant); font-size:var(--font-xs); text-align:center; }
    .multi-select--disabled .multi-select__trigger { background:var(--surface-container-low); color:var(--on-surface-variant); cursor:not-allowed; opacity:.72; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMultiSelectComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly open = signal(false);

  @Input() options: UiMultiSelectOption[] = [];
  @Input() selectedIds: string[] = [MULTI_SELECT_ALL];
  @Input() ariaLabel = 'اختيار متعدد';
  @Input() allLabel = 'الكل';
  @Input() countLabel = 'خيارات';
  @Input() emptyLabel = 'لا توجد خيارات متاحة.';
  @Input() disabled = false;
  @Output() readonly selectedIdsChange = new EventEmitter<string[]>();

  get isAll(): boolean { return this.selectedIds.includes(MULTI_SELECT_ALL); }
  get summary(): string {
    if (this.isAll || !this.selectedIds.length) return this.allLabel;
    const labels = this.options.filter((option) => this.selectedIds.includes(option.id)).map((option) => option.label);
    if (labels.length <= 2) return labels.join(' + ') || this.allLabel;
    return `${labels.length} ${this.countLabel}`;
  }

  toggleOpen(): void { if (!this.disabled) this.open.update((value) => !value); }
  isSelected(id: string): boolean { return !this.isAll && this.selectedIds.includes(id); }
  selectAll(): void { this.selectedIdsChange.emit([MULTI_SELECT_ALL]); }
  toggle(id: string): void {
    const current = this.isAll ? [] : this.selectedIds.filter((value) => value !== MULTI_SELECT_ALL);
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    this.selectedIdsChange.emit(next.length ? next : [MULTI_SELECT_ALL]);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void { this.open.set(false); }
}
