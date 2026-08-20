# Academic Core UI Development Rules

This repository is an Angular + TypeScript school-management system.

Before changing UI, read `DESIGN_SYSTEM.md` and `apps/web/src/app/CONTRIBUTING_UI.md`. Reuse the tokens in `apps/web/src/styles/_tokens.scss` and the existing shared components under `apps/web/src/app/shared/components/`.

UI changes must:

1. Preserve RTL behavior, responsive behavior, existing functionality, and accessibility.
2. Prefer IBM Plex Sans Arabic and semantic design tokens over hard-coded styles.
3. Use the shared button, modal, and confirmation components when applicable.
4. Keep standard controls at 40px and standard table rows at 52px.
5. Avoid arbitrary colours, spacing, radii, heavy shadows, and duplicate visual systems.
6. Never change API contracts, database structure, permissions, routing, or business logic for visual reasons.
7. Validate changes with the relevant Angular build and TypeScript/lint checks.
