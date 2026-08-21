# Design Token Foundation

## Phase 11AD final current-state

The token foundation is **STABLE** and remains the source of truth for new shared UI. Phase 11 closure does not authorize broad raw-color or CSS cleanup. Existing legacy `!important`, `::ng-deep`, and feature-local color usage remain documented deferred debt.

## Source of truth

`apps/web/src/styles/_tokens.scss` is the canonical source for runtime CSS custom properties. Light values live in `:root`; dark values are overridden by `[data-theme='dark']`. `ThemeService` remains the owner of the `data-theme` attribute and `academic-core-theme` persistence.

`apps/web/src/styles.css` contains the Tailwind `@theme` bridge. Its semantic utilities reference the canonical variables rather than defining a second palette.

## Architecture

Primitive palette values (`--color-primary-500`, `--color-neutral-700`, and similar) feed semantic values such as `--primary`, `--surface`, `--text-muted`, `--border`, and `--success`. Future shared components should consume semantic values; feature-specific geometry may remain local when it is not a repeated design decision.

## Token groups

- Color: surfaces, text, actions, states, borders, focus, and overlay.
- Typography: font families, weights, sizes, and line-height references.
- Spacing: the existing 4px-based `--space-*` scale.
- Radius and shadow: the existing control, container, full, and elevation values.
- Size: control, icon, and avatar foundation sizes.
- Layering: `--z-*` references for sticky, dropdown, overlay, toast, and modal layers.
- Motion: existing transition durations and easing references.
- Responsive: 640px mobile, 767px compatibility tablet, and 1024px desktop references.

## Compatibility

Existing `--app-*`, `--text-*`, `--input-*`, `--table-*`, `--card-*`, and `--academic-*` names remain available as compatibility aliases. They resolve to canonical semantic values and are not a new component API.

The `--color-success-emerald`, `--color-warning-amber`, and `--color-error-rose` Tailwind names remain legacy utility aliases because feature templates still use them. They are not the semantic state contract for future components.

## Rules for new UI

Use a semantic token before adding a raw color, spacing, radius, shadow, or layer value. Add a new foundation token only when the value represents a reusable design decision. Do not bulk-migrate existing feature templates in this phase, and do not add a new font provider or change the theme persistence mechanism.
