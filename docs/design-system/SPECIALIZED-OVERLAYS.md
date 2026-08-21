# Specialized overlay architecture audit — Phase 11V

## Phase 11AD final current-state

The specialized-overlay decision remains **DRAWER COUNT TOO LOW / SPECIALIZED OVERLAYS FEATURE-OWNED**. The app-shell mobile navigation is now separately hardened and closed by Phase 11AC; that does not create or justify a reusable `ui-drawer`. Complex exam/results/import, membership, sensitive student, platform/admin, cascade-confirmation, and account-security surfaces remain explicitly deferred to their owning features.

Phase 11 closure does not reopen this audit, introduce a drawer primitive, or require a specialized-overlay migration.

## Audit boundary

Phase 11V is an audit and classification only. No production page, shared component, modal foundation, confirmation foundation, backend, route, dependency, or overlay CSS was changed. The audit starts at `fdeae15` with a clean worktree.

The raw source inventory contains `27` `fixed inset-0` occurrences across `17` files. Two of those occurrences are the wrapper and backdrop layers of one application mobile navigation drawer, and one is an inactive duplicate of the student import-errors template (`students.html`; the active page template is `students.component.html`). Two additional feature surfaces in Exam Analysis use drawer-like markup without a defined drawer shell stylesheet. Therefore:

- Raw fixed-layer occurrences: `27`.
- Active fixed-layer surfaces after collapsing the app drawer layers and excluding the inactive duplicate: `25`.
- Additional drawer-like Exam Analysis surfaces: `2`.
- Active overlay implementations audited: `27`.
- Files containing the raw fixed-layer inventory: `17`.

## Inventory

The fixed-layer table below classifies each raw source occurrence. The two Exam Analysis drawer-like surfaces are recorded separately because they do not use `fixed inset-0`.

| Feature | Overlay | Classification | Position | Complexity | Shared primitive candidate |
| --- | --- | --- | --- | --- | --- |
| App shell | Mobile navigation wrapper | DRAWER | Mobile inline-end panel with viewport layer | Medium | No new primitive yet; one verified drawer |
| App shell | Mobile navigation backdrop | DRAWER layer | Full viewport backdrop | Low | Same implementation as above |
| Institutions | Institution details | SPECIALIZED FEATURE OVERLAY | Centered modal | Low | No; feature details |
| Institutions | Institution create/edit form | OTHER LEGITIMATE OVERLAY | Centered responsive form | Medium | No; standard-form drift to reconcile later |
| Subjects | Subject/topic/skill deletion | COMPLEX CONFIRMATION | Centered modal | High | No; cascade impact |
| Study groups | Create/edit group | OTHER LEGITIMATE OVERLAY | Centered responsive form | Medium | No; standard-form drift to reconcile later |
| Study groups | Group details | SPECIALIZED FEATURE OVERLAY | Centered details modal | Medium | No |
| Study groups | Group membership management | COMPLEX MODAL WORKFLOW | Centered wide modal | High | No; selection and bulk membership state |
| Exams | Create/edit exam | OTHER LEGITIMATE OVERLAY | Centered responsive form | Medium | No; standard-form drift to reconcile later |
| Exams | Link study groups | COMPLEX MODAL WORKFLOW | Centered modal | High | No; multi-selection and derived context |
| Exams | Question management | COMPLEX MODAL WORKFLOW | Centered wide modal | High | No; editable grid and domain state |
| Exams | Result entry | COMPLEX MODAL WORKFLOW | Centered wide modal | High | No; editable result grid and bulk save |
| Classes | Create/edit class | OTHER LEGITIMATE OVERLAY | Centered responsive form | Medium | No; standard-form drift to reconcile later |
| Classes | Class details | SPECIALIZED FEATURE OVERLAY | Centered details modal | Low | No |
| Study groups | Standalone members dialog | COMPLEX MODAL WORKFLOW | Centered wide modal | High | No; selection and membership actions |
| Students | Import errors (active template) | COMPLEX MODAL WORKFLOW | Centered scrollable modal | High | No; spreadsheet error output |
| Students | Import errors (inactive duplicate template) | LEGACY DUPLICATION | Centered scrollable modal | High | No; remove only in a separate cleanup phase |
| Settings / Roles | Role form | PLATFORM / ADMIN OVERLAY | Centered admin form | High | No; permission matrix boundary |
| Settings / Institution Users | Create user | PLATFORM / ADMIN OVERLAY | Centered admin form | High | No; account workflow |
| Settings / Institution Users | Reissue account setup link | SPECIALIZED CONFIRMATION | Centered security workflow | High | No; expiry/revocation semantics |
| Settings / Institution Users | Edit roles | PLATFORM / ADMIN OVERLAY | Centered admin form | High | No; permission assignment |
| Enrollments | Transfer enrollment | COMPLEX MODAL WORKFLOW | Centered scrollable modal | High | No; relationship and validation workflow |
| Platform | Create institution | PLATFORM / ADMIN OVERLAY | Centered admin form | High | No; platform permissions and onboarding |
| Academic years | Year/period deletion | COMPLEX CONFIRMATION | Centered modal | High | No; cascade/dependency impact |
| Students | Student form | OTHER LEGITIMATE OVERLAY | Centered large form | High | No; page-specific form workflow |
| Students | Student details | SPECIALIZED FEATURE OVERLAY | Centered scrollable details modal | High | No; sensitive student surface |
| Staff | Staff profile | SPECIALIZED FEATURE OVERLAY | Centered details modal despite side-sheet comment | Medium | No; no true side placement |

### Additional drawer-like surfaces not represented by `fixed inset-0`

| Surface | Feature | Classification | Evidence | Decision |
| --- | --- | --- | --- | --- |
| Question details | Exam Analysis | SPECIALIZED FEATURE OVERLAY | `drawer-backdrop` / `drawer` markup, but no matching drawer shell CSS or fixed positioning was found | Feature-owned; not a verified shared drawer |
| Student analysis details | Exam Analysis | SPECIALIZED FEATURE OVERLAY | Same markup pattern; domain-specific analysis content and no shared behavior | Feature-owned; not a verified shared drawer |

## Counts and boundaries

### Fixed-layer classification

| Classification | Count |
| --- | ---: |
| DRAWER layers | 2 |
| BOTTOM / SIDE SHEET | 0 |
| COMPLEX MODAL WORKFLOW | 7 |
| FULLSCREEN WORKFLOW | 0 |
| SPECIALIZED FEATURE OVERLAY | 5 |
| COMPLEX CONFIRMATION | 2 |
| SPECIALIZED CONFIRMATION | 1 |
| PLATFORM / ADMIN OVERLAY | 4 |
| OTHER LEGITIMATE OVERLAY | 5 |
| LEGACY DUPLICATION | 1 |
| **Total fixed occurrences** | **27** |

True Drawer implementations: `1` (the mobile app navigation). True Sheets: `0`. The two Exam Analysis surfaces are drawer-like in naming only and are classified as specialized feature overlays because a reusable shell and behavior are not present.

There is no verified bottom sheet. No surface demonstrates a consistent bottom-entry, responsive sheet conversion distinct from the centered modal pattern.

## Feature distribution

| Feature area | Raw fixed occurrences |
| --- | ---: |
| App shell | 2 |
| Exams | 4 |
| Study groups | 4 |
| Students | 4 |
| Institutions | 2 |
| Classes | 2 |
| Settings / Platform | 5 |
| Confirmations in Subjects / Academic Years | 2 |
| Enrollments | 1 |
| Staff | 1 |
| **Total** | **27** |

## Behavior and accessibility findings

The verified mobile navigation drawer is the only real side panel. Its backdrop is translucent/blurred, dismissal is click-based, and its panel scrolls locally. It does not implement a dedicated focus trap or reference-counted body scroll lock. Its direction is expressed through the existing RTL layout rather than an explicit logical-side API.

The centered feature surfaces generally use a focusable wrapper and local Escape/backdrop handlers, but do not provide the `ui-modal` foundation's initial-focus, focus-containment, restore-focus, or body-scroll-lock behavior. The standalone members dialog provides a labelled section and focusable wrapper but still lacks a shared focus trap and restore policy. Exam Analysis drawer-like surfaces are weaker: click dismissal exists, but the drawer shell behavior is not defined by source CSS and Tab/Shift+Tab containment is not implemented.

Summary:

- Initial focus: `MISSING` for the raw feature overlays; `PARTIAL` where a wrapper receives focus implicitly.
- Focus containment: `MISSING` across the raw feature overlays; no feature trap was found.
- Focus restoration: `MISSING` for the raw feature overlays; close handlers only clear local state.
- Escape: `PARTIAL`; present in several centered surfaces, absent from some admin/platform and analysis surfaces.
- Tab/Shift+Tab: `MISSING` as a managed overlay behavior.
- Body scroll lock: `0` dedicated feature lock implementations found; local internal scrolling is common.
- Potential body-scroll conflicts: `HIGH` where a raw overlay is opened over an already scrollable page or nested workflow.
- ARIA: `PARTIAL`; some wrappers use `role="dialog"`/`aria-modal`, while many centered surfaces rely on visual markup only. Not every surface should become a dialog: app navigation is navigation, analysis details are closer to a labelled region, and full workflow forms are page-like application content.

## Backdrop, theme, direction, and layering

Backdrop behavior has three practical patterns: translucent without blur, translucent with blur, and darker admin/platform translucent backdrops. Most allow click dismissal; pending locks are feature-specific and inconsistent. No locked backdrop pattern is shared across this inventory.

The overlays are not fully tokenized. The pattern-level theme assessment is `0` fully tokenized, `27` partial, and `0` fully hardcoded: semantic classes appear beside raw slate/stone/rose/violet colors and arbitrary shadows. This is architectural evidence, not a Phase 11V cleanup target.

Z-index is hardcoded in the raw surfaces (`z-50`, `z-10`, and one inline `z-index: 9999`); no specialized overlay z-index token was found. The inline positioning count is `2` overlay-specific style attributes, both on the student form template. Dynamic style bindings found in overlay-adjacent analysis are domain data coloring, not generic overlay placement.

Overlay-related `!important`: `0 / 87` by source scan of the identified overlay files. Overlay-related `::ng-deep`: `0 / 4`. Raw colors are widespread in the legacy feature shells; no cleanup was performed.

## Reuse analysis

Presentational shell duplication is **HIGH**: repeated full-viewport backdrops, centered panels, headers, close buttons, local scrolling, and responsive widths are visible. Behavioral reuse is **LOW**: navigation, forms, permission assignment, imports, editable grids, cascade confirmations, and sensitive student/admin surfaces differ in lifecycle, dismissal, accessibility, and domain ownership. Business coupling is **HIGH**.

Removing business content does not leave one stable shell contract. A generic `ui-overlay`, registry, stack manager, or portal abstraction is not justified by the count alone. The existing `ui-modal` and `ui-confirm-dialog` remain the correct boundaries for Standard forms/modals and Standard confirmations; complex and specialized workflows should remain feature-owned.

## Architecture decision

**DRAWER COUNT TOO LOW**

**SPECIALIZED OVERLAYS SHOULD REMAIN FEATURE-OWNED**

The evidence supports no new shared Drawer or Sheet primitive in this phase: one verified Drawer and zero verified Sheets are insufficient, while the two analysis surfaces are not behaviorally complete Drawers. The specialized surfaces should not be migrated merely because their CSS shells look similar.

Shared Design System ownership remains:

- Standard form controls and buttons.
- Standard tables and data-display states.
- Standard modal shell through `ui-modal`.
- Standard confirmations through `ui-confirm-dialog`.
- Generic badge and empty-state primitives.

Feature ownership remains:

- Complex exam/result/scoring workflows.
- Spreadsheet import and preview/error workflows.
- Study-group membership and transfer workflows.
- Sensitive student details/forms.
- Platform/admin permission and onboarding workflows.
- Cascade confirmations and account-security confirmations.
- Any future true Drawer until a second materially similar implementation is proven.

## Recommended next step

The next design-system priority is **ACCESSIBILITY DESIGN-SYSTEM DEBT CONSOLIDATION**. The audit found repeated missing focus containment, focus restoration, body-scroll coordination, and incomplete ARIA semantics across raw feature overlays; this is stronger evidence than the current Drawer count for a cross-cutting follow-up audit. No Phase 11W work is started here, and no specialized overlay migration is recommended.

## Verification boundary

- Production pages changed: `0`.
- Shared production components changed: `0`.
- `ui-modal`: `0`.
- `ui-confirm-dialog`: `0`.
- Backend / Prisma / routes / dependencies: `0`.
- Angular build: last known PASS from Phase 11U; documentation-only changes do not require a rebuild.
