import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'ui-textarea',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiTextareaComponent), multi: true }],
  template: `
    <textarea
      class="ui-form-control ui-form-control--textarea"
      [class.ui-form-control--invalid]="invalid()"
      [id]="id() || null"
      [attr.name]="name() || null"
      [value]="value()"
      [placeholder]="placeholder()"
      [attr.autocomplete]="autocomplete() || null"
      [attr.maxlength]="maxLength() ?? null"
      [attr.required]="required() ? '' : null"
      [attr.readonly]="readOnly() ? '' : null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [disabled]="isDisabled()"
      (input)="onInput($event)"
      (blur)="onBlur()"
    ></textarea>
  `,
})
export class UiTextareaComponent implements ControlValueAccessor {
  readonly id = input('');
  readonly name = input('');
  readonly placeholder = input('');
  readonly autocomplete = input('');
  readonly maxLength = input<number | null>(null);
  readonly required = input(false);
  readonly readOnly = input(false);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly ariaLabel = input('');
  readonly describedBy = input('');
  readonly value = signal('');
  private readonly formDisabled = signal(false);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  readonly isDisabled = () => this.disabled() || this.formDisabled();

  writeValue(value: unknown): void { this.value.set(value == null ? '' : String(value)); }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.formDisabled.set(disabled); }
  onInput(event: Event): void { const value = (event.target as HTMLTextAreaElement).value; this.value.set(value); this.onChange(value); }
  onBlur(): void { this.onTouched(); }
}
