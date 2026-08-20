import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'ui-form-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-form-field" [class.ui-form-field--invalid]="!!errorText() || invalid()">
      <label class="ui-form-field__label" [attr.for]="controlId() || null">
        <span>{{ label() }}</span>
        @if (required()) { <span class="ui-form-field__required" aria-hidden="true">*</span> }
      </label>
      <ng-content></ng-content>
      @if (errorText()) {
        <div class="ui-form-field__error" [id]="errorId()" role="alert">{{ errorText() }}</div>
      } @else if (helperText()) {
        <div class="ui-form-field__helper" [id]="helperId()">{{ helperText() }}</div>
      }
    </div>
  `,
})
export class UiFormFieldComponent {
  readonly label = input('');
  readonly controlId = input('');
  readonly required = input(false);
  readonly invalid = input(false);
  readonly helperText = input('');
  readonly errorText = input('');

  readonly helperId = computed(() => this.controlId() ? `${this.controlId()}-helper` : '');
  readonly errorId = computed(() => this.controlId() ? `${this.controlId()}-error` : '');
  readonly describedBy = computed(() => this.errorText() ? this.errorId() : this.helperText() ? this.helperId() : '');
}
