import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'ui-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiInputComponent), multi: true }],
  template: `
    <input
      class="ui-form-control"
      [class.ui-form-control--invalid]="invalid()"
      [class.ui-form-control--sm]="size() === 'sm'"
      [class.ui-form-control--lg]="size() === 'lg'"
      [id]="id() || null"
      [attr.name]="name() || null"
      [type]="type()"
      [value]="value()"
      [placeholder]="placeholder()"
      [attr.autocomplete]="autocomplete() || null"
      [attr.inputmode]="inputMode() || null"
      [attr.min]="min() ?? null"
      [attr.max]="max() ?? null"
      [attr.maxlength]="maxLength() ?? null"
      [attr.required]="required() ? '' : null"
      [attr.readonly]="readOnly() ? '' : null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [disabled]="isDisabled()"
      (input)="onInput($event)"
      (blur)="onBlur()"
    />
  `,
})
export class UiInputComponent implements ControlValueAccessor {
  readonly id = input('');
  readonly name = input('');
  readonly type = input<'text' | 'email' | 'password' | 'number' | 'tel' | 'search' | 'date'>('text');
  readonly placeholder = input('');
  readonly autocomplete = input('');
  readonly inputMode = input('');
  readonly min = input<string | number | null>(null);
  readonly max = input<string | number | null>(null);
  readonly maxLength = input<number | null>(null);
  readonly required = input(false);
  readonly readOnly = input(false);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly describedBy = input('');
  readonly ariaLabel = input('');
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
  onInput(event: Event): void { const value = (event.target as HTMLInputElement).value; this.value.set(value); this.onChange(value); }
  onBlur(): void { this.onTouched(); }
}
