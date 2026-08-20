import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'ui-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiSelectComponent), multi: true }],
  template: `
    <select
      class="ui-form-control"
      [class.ui-form-control--invalid]="invalid()"
      [class.ui-form-control--sm]="size() === 'sm'"
      [class.ui-form-control--lg]="size() === 'lg'"
      [id]="id() || null"
      [attr.name]="name() || null"
      [value]="value()"
      [attr.required]="required() ? '' : null"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [disabled]="isDisabled()"
      (change)="onSelect($event)"
      (blur)="onBlur()"
    ><ng-content></ng-content></select>
  `,
})
export class UiSelectComponent implements ControlValueAccessor {
  readonly id = input('');
  readonly name = input('');
  readonly required = input(false);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly describedBy = input('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly value = signal('');
  private readonly formDisabled = signal(false);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  readonly isDisabled = () => this.disabled() || this.formDisabled();

  writeValue(value: unknown): void { this.value.set(value == null ? '' : String(value)); }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.formDisabled.set(disabled); }
  onSelect(event: Event): void { const value = (event.target as HTMLSelectElement).value; this.value.set(value); this.onChange(value); }
  onBlur(): void { this.onTouched(); }
}
