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
- `ui-select`: projected native `<option>` elements, optional `ariaLabel` for standalone filter controls; no custom overlay.
- `ui-textarea`: native textarea with vertical resize behavior.

Checkbox, radio, file upload, date picker, and search-specific primitives remain deferred until repeated usage justifies them.
## Data display primitives

### `ui-badge`

`ui-badge` is a presentational status primitive. It accepts only generic `tone`, `size`, and `variant` inputs (`success`, `warning`, `danger`, `info`, `neutral`, or `disabled`) and projects the feature-owned status label. It does not map business statuses, fetch data, or own permissions. Use it for inline status content outside semantic table structure.

### `ui-empty-state`

`ui-empty-state` is a presentational standalone empty-state shell with optional icon, title, description, compact mode, and projected actions marked with `ui-empty-action`. Keep table empties as native `<tr><td colspan="...">` markup; do not place this component inside `<tbody>`.

There is intentionally no shared `ui-loading` component at this stage. Loading presentation remains feature-owned because the audit found materially different page, section, table, modal, and button contracts. Button loading remains owned by `ui-button`.

## `ui-modal`

`ui-modal` is the standard presentational modal shell. Existing inputs and outputs remain backward-compatible: `open`, `title`, `closeOnBackdrop`, `closeOnEscape`, and `closed`. The foundation also supports optional `description` text, `size` (`sm`, `md`, or `lg`, default `md`), and generic `dismissible` control (default `true`) for coordinated pending states. Content remains projected through `[ui-modal-header]`, `[ui-modal-body]`, and `[ui-modal-footer]`.

The shell owns dialog semantics, unique title/description associations, initial focus, Tab/Shift+Tab containment, Escape handling, focus restoration, and reference-counted body scroll locking. `ui-confirm-dialog` remains composed over this shell and must not add duplicate focus or scroll handling. Feature consumers continue to own content, forms, validation, permissions, API calls, and business actions.

## `ui-confirm-dialog`

`ui-confirm-dialog` is the standard event-based confirmation foundation composed over `ui-modal`. Inputs are `open`, `title`, `message`, `confirmText` (default `تأكيد`), `cancelText` (default `إلغاء`), `variant` (`danger | warning | default`), and `loading` (default `false`). Outputs remain `confirmed` and `cancelled`.

When `loading` is true, the confirm action uses `ui-button`'s shared loading presentation and native disabled semantics. Confirm and cancel events are guarded, and the dialog becomes non-dismissible through its close button, backdrop, and Escape. The feature owns the request, loading value, error handling, and final close decision; the shared component has no business or API knowledge. The default `loading=false` behavior is unchanged.
