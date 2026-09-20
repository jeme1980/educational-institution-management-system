import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
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
    <details class="multi-select" [class.multi-select--disabled]="disabled">
      <summary [attr.aria-label]="ariaLabel" [attr.aria-disabled]="disabled" (click)="disabled && $event.preventDefault()">
        <span>{{ summary }}</span><mat-icon aria-hidden="true">expand_more</mat-icon>
      </summary>
      <fieldset [disabled]="disabled" [attr.aria-label]="ariaLabel">
        <label class="multi-select__all"><input type="checkbox" [checked]="isAll" (change)="selectAll()" /><span>{{ allLabel }}</span></label>
        <div class="multi-select__options">
          @for (option of options; track option.id) {
            <label><input type="checkbox" [checked]="isSelected(option.id)" [disabled]="option.disabled" (change)="toggle(option.id)" /><span>{{ option.label }}</span></label>
          } @empty { <p>{{ emptyLabel }}</p> }
        </div>
      </fieldset>
    </details>
  `,
  styles: [`
    :host { display:block; min-width:0; }
    .multi-select { position:relative; }
    summary { display:flex; align-items:center; justify-content:space-between; gap:var(--space-2); min-height:2.5rem; padding-inline:var(--space-3); border:1px solid var(--outline); border-radius:var(--radius-md); background:var(--surface-container-lowest); color:var(--on-surface); font-size:var(--font-sm); font-weight:var(--font-medium); cursor:pointer; list-style:none; }
    summary::-webkit-details-marker { display:none; }
    summary:focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
    summary mat-icon { color:var(--on-surface-variant); transition:transform 160ms ease; }
    details[open] summary mat-icon { transform:rotate(180deg); }
    fieldset { position:absolute; z-index:20; inset-inline:0; top:calc(100% + var(--space-1)); margin:0; padding:var(--space-2); border:1px solid var(--outline); border-radius:var(--radius-md); background:var(--surface-container-lowest); box-shadow:var(--shadow-md); }
    label { display:flex; align-items:center; gap:var(--space-2); min-height:2.5rem; padding-inline:var(--space-2); border-radius:var(--radius-sm); color:var(--on-surface); font-size:var(--font-sm); font-weight:var(--font-regular); cursor:pointer; }
    label:hover { background:var(--surface-container-low); }
    input { inline-size:1rem; block-size:1rem; accent-color:var(--primary); }
    .multi-select__all { border-bottom:1px solid var(--outline-variant); font-weight:var(--font-semibold); }
    .multi-select__options { max-height:16rem; overflow:auto; padding-block-start:var(--space-1); }
    p { margin:0; padding:var(--space-3); color:var(--on-surface-variant); font-size:var(--font-xs); text-align:center; }
    .multi-select--disabled summary { background:var(--surface-container-low); color:var(--on-surface-variant); cursor:not-allowed; opacity:.72; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMultiSelectComponent {
  @Input() options: UiMultiSelectOption[] = [];
  @Input() selectedIds: string[] = [MULTI_SELECT_ALL];
  @Input() ariaLabel = 'اختيار متعدد';
  @Input() allLabel = 'الكل';
  @Input() emptyLabel = 'لا توجد خيارات متاحة.';
  @Input() disabled = false;
  @Output() readonly selectedIdsChange = new EventEmitter<string[]>();

  get isAll(): boolean { return this.selectedIds.includes(MULTI_SELECT_ALL); }
  get summary(): string {
    if (this.isAll || !this.selectedIds.length) return this.allLabel;
    const labels = this.options.filter((option) => this.selectedIds.includes(option.id)).map((option) => option.label);
    if (labels.length <= 2) return labels.join(' + ') || this.allLabel;
    return `${labels.length} محددة`;
  }
  isSelected(id: string): boolean { return !this.isAll && this.selectedIds.includes(id); }
  selectAll(): void { this.selectedIdsChange.emit([MULTI_SELECT_ALL]); }
  toggle(id: string): void {
    const current = this.isAll ? [] : this.selectedIds.filter((value) => value !== MULTI_SELECT_ALL);
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    this.selectedIdsChange.emit(next.length ? next : [MULTI_SELECT_ALL]);
  }
}
