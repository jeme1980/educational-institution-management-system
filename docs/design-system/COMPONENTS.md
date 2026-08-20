# Shared UI primitives

These primitives are the official foundation for future controlled migrations. Existing feature templates remain unchanged until a later migration phase.

## `ui-button`

- Purpose: accessible native button with shared variants and loading state.
- Inputs: `variant` (`primary | secondary | danger | ghost`), `size` (`sm | md | lg`), `type`, `disabled`, `loading`, and optional `ariaLabel`.
- States: default, hover, active through native interaction, focus-visible, disabled, and loading.
- Accessibility: remains a native `<button>`; `type` defaults to `button`, loading sets `aria-busy`, and icon-only usage should provide `ariaLabel`.

```html
<ui-button variant="primary" size="md" type="submit">حفظ</ui-button>
```

## `ui-form-field`

- Purpose: consistent label, required marker, helper text, and error presentation.
- Inputs: `label`, `controlId`, `required`, `helperText`, `errorText`, and `invalid`.
- Accessibility: associates the label through `for`/`id`; `describedBy()` returns the helper/error id for the control's `aria-describedby`.

```html
<ui-form-field #field label="البريد الإلكتروني" controlId="email" [required]="true" helperText="استخدم بريد المؤسسة.">
  <ui-input id="email" type="email" autocomplete="email" [required]="true" [describedBy]="field.describedBy()" />
</ui-form-field>
```

## `ui-input`, `ui-select`, and `ui-textarea`

These are native-control wrappers implementing `ControlValueAccessor`. They preserve browser semantics, autocomplete, keyboard behavior, RTL flow, and native select behavior while adding token-backed invalid, disabled, readonly, focus, and size states.

- `ui-input`: `text`, `email`, `password`, `number`, `tel`, `search`, and `date`.
- `ui-select`: projected native `<option>` elements; no custom overlay.
- `ui-textarea`: native textarea with vertical resize behavior.

Checkbox, radio, file upload, date picker, and search-specific primitives remain deferred until repeated usage justifies them.
