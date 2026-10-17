# Academic Core UI Design System

This document is the visual contract for the Angular school-management application. It is intentionally implementation-oriented: existing screens keep their behavior, API contracts, routes, permissions, and data models while visual work migrates incrementally to these rules.

## Foundations

- Direction: RTL by default. Use `dir="rtl"` at the application or feature boundary; use `dir="ltr"` only for phone numbers, email, codes, and other directional values.
- Typeface: `IBM Plex Sans Arabic`, with `Noto Sans` and `system-ui` fallbacks.
- Base unit: 4px. Prefer the spacing tokens in `apps/web/src/styles/_tokens.scss`.
- School page container: full available width after the sidebar, without a centered maximum width. The shared app shell owns symmetric inline padding: `--space-6` (24px) on desktop and `--space-4` (16px) below 1024px, aligned with the topbar. Page wrappers must not add horizontal padding or centered width caps. Keep width constraints only on internal content that needs them, such as dialogs, text, and form controls.
- Controls: 40px minimum height, visible focus state, and a restrained 4px default radius.
- Standard table rows: 52px minimum height, tabular numerals, subtle borders, and no heavy shadows.

## Tokens

The canonical semantic tokens are defined in `_tokens.scss`:

- Surfaces: `--surface`, `--surface-container-*`, `--on-surface`, `--on-surface-variant`.
- Actions: `--primary`, `--secondary`, and their container/on-colour pairs.
- State: `--success`, `--warning`, `--danger`, and `--neutral` with matching containers.
- Typography: `--text-*` and `--font-family-*`.
- Layout: `--space-*`, `--radius-*`, `--control-height`, and `--table-row-height`.

Do not add page-specific hex colours, arbitrary spacing, or one-off radius values when a token expresses the intent. Branding may override the primary action colour through the existing institution branding mechanism; semantic success, warning, danger, and neutral colours must remain stable.

## Components

Reuse the existing shared components before creating local variants:

- `ui-button`: primary, secondary, danger, and ghost actions.
- `ui-modal`: modal frame, RTL direction, escape/backdrop behavior, and slots.
- `ui-confirm-dialog` / `ConfirmDialogService`: destructive and warning confirmations.

New reusable UI belongs under `apps/web/src/app/shared/components/`. A feature-local component is appropriate only when its behavior is not reusable.

## Analytical charts

The project chart standard is Chart.js through `ng2-charts`. Feature-owned chart wrappers belong with the feature, while shared theme/configuration belongs under `apps/web/src/app/shared/charts/`. Chart options must read semantic tokens at runtime so light/dark theme changes update without a full reload, and must configure RTL text direction, responsive sizing, tooltips, and reduced-motion behavior. Charts must have an accessible label plus a textual summary or legend; colour alone is not sufficient. D3 and additional chart libraries are not part of the standard unless a future visualization cannot reasonably be implemented with Chart.js.

## Buttons and forms

- Primary: academic blue surface with white text.
- Secondary: white surface with outline and academic-blue text.
- Tertiary/ghost: transparent until hover.
- Danger: semantic danger tint or surface; do not use danger styling for ordinary actions.
- Labels sit above controls. Required fields use the existing form conventions.
- Never use `window.confirm()` or `confirm()`; route confirmation through the shared dialog service.

## Cards, tables, badges, and elevation

- Cards use a white surface, a thin outline, 16px padding where space permits, and a small shadow only when separation is needed.
- Tables use a single visual system: compact but readable headers, 52px rows, thin dividers, hover background only, and responsive overflow when columns cannot be reduced safely.
- Status badges are rounded-full and use semantic state colours. Do not use status colours for decoration.
- Elevation is restrained: borders and tonal surfaces are preferred; overlays may use the shared modal shadow.

## Responsive and RTL rules

- Desktop is 1024px and above; tablet is 768px–1023px; mobile is below 768px.
- Preserve the current navigation and routing behavior. Responsive changes should alter layout, not functionality.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`) where possible.
- Icons that communicate direction must be mirrored or chosen for the RTL flow.

## Migration policy

Migration is incremental. Start with tokens and shared primitives, then migrate one screen at a time. Do not rewrite all templates in one change, and do not modify backend logic, database structure, API contracts, permissions, or routing for visual reasons. Every migration should finish with an Angular build and, when available, lint/type checks.

## Themes

The application supports `light` and `dark` through the root `data-theme` attribute. `ThemeService` is the single owner of the state, applies the attribute to `<html>`, and persists the selection under `academic-core-theme` in `localStorage`. Components must consume semantic tokens and must not add component-specific dark-mode classes or use filters such as `invert()` or `brightness()`.

The current topbar toggle is the shared entry point. RTL, focus states, tables, forms, cards, badges, and modals must remain functional in both themes.
