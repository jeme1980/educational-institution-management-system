# Accessibility Design-System Debt Consolidation

## Phase 11W scope and decision

This document contains the Phase 11W audit and the Phase 11X shared-foundation resolution record. Phase 11X is limited to two generic, non-breaking primitive improvements. No API contract, database schema, route, permission, dependency, or feature behavior was changed.

Audit baseline:

- Branch: `feature/design-system`
- Starting commit: `69f20f0`
- Release candidate tag: `v0.1.0-rc.1` preserved
- Full web lint baseline: `187 problems (49 errors, 138 warnings)`
- Accessibility lint diagnostics: `30` (`15` interaction sites × the two Angular accessibility rules)
- Angular production build: last known pass from Phase 11U; not rerun because this phase is documentation-only
- Browser verification: unavailable in this execution environment

The audit uses the repository source, shared primitives, the Phase 11V specialized-overlay inventory, and static Angular ESLint output. Counts below are issue clusters unless explicitly marked as diagnostics; they are not a claim that every rendered state was exhaustively tested with assistive technology.

## Findings overview

| Severity | Cluster count | Decision |
| --- | ---: | --- |
| A11Y-HIGH | 3 | Prioritize keyboard-equivalent overlay dismissal, focus containment/restore for legacy specialized overlays, and icon-only control naming where confirmed in feature batches. |
| A11Y-MEDIUM | 7 | Address after the shared foundation decision: form error wiring, pagination state, mobile drawer focus behavior, complex table headers, page titles/headings, reduced motion, and legacy contrast review. |
| A11Y-LOW | 4 | Consolidate semantic polish such as contextual status roles, redundant container tab stops, decorative icon conventions, and minor landmark consistency. |

These are consolidated findings, not 14 individual DOM defects. The highest-risk concentration is in feature-owned legacy overlays and their close surfaces, not in the shared modal/confirmation primitives.

## Findings by category

| Category | Finding | Severity | Boundary |
| --- | --- | --- | --- |
| Semantic HTML | Several legacy overlay close surfaces are clickable `div` containers rather than buttons. | HIGH | Feature |
| Keyboard | 15 lint-triggering overlay close sites have no native keyboard equivalent; this produces 30 accessibility diagnostics. | HIGH | Feature |
| Focus | Legacy specialized overlays commonly use `tabindex="0"` on containers without a real focus trap or restore policy. | HIGH | Feature |
| Forms | `ui-form-field` exposes the correct label/error contract, but consumers must consistently pass `controlId`, `describedBy`, and invalid state. | MEDIUM | Integration |
| Buttons and links | Shared buttons are native and correctly typed; remaining risk is isolated to legacy feature controls and icon-only consumers. | MEDIUM | Mixed |
| Tables | Standard table shell behavior is mature; complex exam, permissions, and result matrices need feature-owned header/scope review. | MEDIUM | Feature |
| Dialogs | `ui-modal` and `ui-confirm-dialog` provide the expected dialog semantics, focus handling, Escape behavior, and scroll locking. Legacy custom dialogs do not consistently do so. | HIGH | Mixed |
| ARIA | Shared ARIA wiring is sound; `role="status"` on every badge/empty state needs contextual review, and custom dialogs remain inconsistent. | LOW | Mixed |
| Contrast | Shared semantic tokens and focus tokens are the safe baseline. Hard-coded legacy feature colors require representative contrast checks. | MEDIUM | Mixed |
| Status | Shared status presentation is not color-only when text is present; noisy live-region behavior should be reviewed contextually. | LOW | Shared |
| Icons | Decorative icons are generally hidden in shared primitives; icon-only feature actions need an explicit accessible name. | LOW | Mixed |
| Headings and landmarks | The application has RTL landmarks and a skip-to-main target, but page title/heading strategy is not consistently route-specific. | MEDIUM | Global/feature |
| Responsive behavior | The mobile navigation is a native-button drawer, but focus return, `aria-expanded`, and `aria-controls` are not a shared contract. | MEDIUM | Feature |
| Motion | Multiple feature animations/transitions exist and no `prefers-reduced-motion` policy was found. | MEDIUM | Global/feature |

## Shared foundation maturity

| Primitive | Maturity | Evidence and boundary |
| --- | --- | --- |
| `ui-button` | PASS | Native button, explicit type, native disabled behavior, loading state, `aria-busy`, and focus-visible styling. Consumers remain responsible for naming projected icon-only content. |
| `ui-form-field` | PASS with integration gap | Label association and alert errors are available. The primitive cannot infer the child control’s `aria-describedby`/invalid binding; consumers must use the contract. |
| `ui-input` | PASS | Native input with id/name, disabled/required state, accessible label and description inputs, and invalid state. |
| `ui-select` | PASS | Native select with the same explicit accessibility contract. |
| `ui-textarea` | RESOLVED IN 11X | Added the optional `ariaLabel` input while preserving visible-label usage and all existing value/control behavior. |
| `pagination` | RESOLVED IN 11X | The active page now exposes `aria-current="page"`; native buttons, labels, disabled state, keyboard behavior, and RTL remain unchanged. |
| `ui-badge` | PASS with contextual review | Text is not color-only and the icon is decorative. `role="status"` should remain contextual rather than automatic for static labels. |
| `ui-empty-state` | PASS with contextual review | Heading, description, hidden decorative icon, status announcement, and projected action are available. |
| `ui-modal` | PASS | Dialog role, modal semantics, labelled/described references, initial focus, focus trap, focus restore, Escape/backdrop handling, and body-scroll locking are implemented. |
| `ui-confirm-dialog` | PASS | Composes the modal foundation and correctly handles pending confirmation state, disabled dismissal, and loading. |
| Standard table shell | PASS | The shared table presentation is suitable for standard data display; complex feature-specific matrices remain outside this foundation decision. |

### Foundation decision

The shared accessibility foundation is **stable after the bounded 11X hardening**. It is not a reason to reopen completed button, form, table, or modal migrations. The two findings selected from 11W are resolved without consumer changes. Feature-level defects must not be solved by weakening or duplicating these primitives.

## Keyboard and focus audit

- Clickable non-interactive close surfaces: 15 lint-triggering source sites across classes, exams, institutions, platform, and study groups; each lacks the native keyboard behavior required by the two Angular rules.
- Additional overlay click/stop-propagation handlers exist in other feature dialogs, including Exam Analysis. These are feature-owned and must be assessed with their actual open/close flow.
- Missing keyboard equivalent for the lint-triggering sites: 15 confirmed source sites.
- `tabindex > 0`: 0 observed.
- `tabindex="0"`: multiple legacy overlay wrappers use it as a lint/focus workaround. It does not create a focus trap and should not be treated as a shared accessibility solution.
- Shared button, pagination, and modal focus-visible styling is present. Legacy feature CSS removes outlines in several places; some provide a replacement border or shadow, so each feature batch needs representative keyboard review.

## Forms and validation

The shared form contract is adequate: visible labels can target controls, required state is native, error text has an alert role, and controls accept description/invalid bindings. The remaining debt is integration consistency in legacy templates:

- Placeholder-only and weakly labelled controls occur mainly in search/filter surfaces; a trustworthy project-wide unique count was not asserted from static text alone.
- Error association is correct when consumers pass `describedBy`; consumer omissions are the primary gap.
- Required markers must remain supplemental to native `required` semantics and must not be the only indication.
- No shared form-foundation rewrite is justified in Phase 11W.

## Tables and data display

The standard data-display foundation is acceptable for normal tables. The residual risk is feature-owned complexity: exam/result matrices, permission grids, and other multi-axis tables need explicit header relationships and scope review. This is a bounded feature accessibility task, not a reason to change the standard table shell.

## Overlays, ARIA, and status communication

The shared modal and confirmation components are the accessibility boundary for standard dialogs and are verified as mature. Phase 11V identified a single true drawer and no true sheet family; specialized overlays should therefore remain feature-owned.

The mobile drawer uses a native backdrop button and native close button, but its trigger/focus-return/expanded-state behavior is not yet a shared contract. Legacy custom overlays use container click handlers and ad-hoc `tabindex="0"`; these are the highest-value feature migration candidates. Do not create a generic “special overlay” primitive from this audit alone.

## Contrast, headings, landmarks, RTL, and motion

- RTL: the document and application shell declare Arabic/RTL, and the main shell uses RTL direction. Shared pagination also preserves RTL behavior.
- Landmarks: the shell includes navigation, aside, and a `main` target with `id="main-content"` and `tabindex="-1"` for skip/focus flow.
- Page title: the root title remains the generic `Google AI Studio Angular App`; route-specific title strategy is not consistently visible in the inspected source and should be handled as a bounded global/feature task.
- Contrast: tokenized shared controls are the reference baseline. Hard-coded legacy colors need representative contrast measurement during feature work; no pixel-level contrast claim is made here.
- Motion: no reduced-motion media policy was found, while feature transitions/animations exist. Add policy and verify behavior in a later bounded phase.

## Shared versus feature-specific boundary

### Shared design-system findings

1. RESOLVED IN 11X: add active-page semantics to pagination.
2. RESOLVED IN 11X: add an optional standalone accessible-label input for `ui-textarea`.
3. Preserve existing modal, confirmation, button, form-field, and table contracts; feature-specific findings remain outside the foundation boundary.

### Feature-specific findings

1. Replace clickable overlay containers with native close buttons or a keyboard-equivalent interaction.
2. Remove ad-hoc container tab stops and implement focus containment/restore per legacy overlay.
3. Review custom dialog ARIA, form associations, table headers, icon names, contrast, and mobile drawer state in controlled feature batches.

The boundary is intentionally strict: shared primitives provide semantics and contracts; features own their overlay lifecycle, data shape, labels, and complex table structure.

## Prioritized remediation queue

| Priority | Scope | Deliverable | Excluded |
| --- | --- | --- | --- |
| 1 | Shared foundation | RESOLVED IN 11X: pagination `aria-current` and optional textarea label contract. | Feature migration, redesign |
| 2 | Legacy specialized overlays | Keyboard dismissal, focus containment/restore, dialog naming, and removal of container-tabindex workarounds in one controlled batch. | New generic drawer/sheet primitive |
| 3 | Feature forms and controls | Label/error association, icon names, native button/link semantics, and representative contrast checks. | API/business changes |
| 4 | Complex data display | Header scope/relationships and keyboard review for exam/results/permissions matrices. | Replacing standard table shell |
| 5 | Global polish | Route titles/headings, mobile nav state/return focus, reduced motion, and landmark consistency. | Broad visual redesign |

## Architecture decision and next phase

Decision: **MIXED — shared foundation stable, then controlled feature accessibility batches.** The two bounded contract improvements are complete. The larger remaining debt is feature-owned and concentrated in legacy custom overlays, so a new universal overlay abstraction is not warranted.

Recommended single next phase (not started):

**Phase 11Y — CONTROLLED FEATURE ACCESSIBILITY REMEDIATION — BATCH 1**

Select 2–4 screens from the existing A11Y-HIGH/P1 feature findings, beginning with keyboard and focus behavior in legacy specialized overlays. Do not begin 11Y in this phase.

## Verification record

- `git status --short --branch`: clean at the start of Phase 11X.
- `git rev-parse HEAD`: `53b7fe731326c20c68fab79164163390200b3403`.
- `npm.cmd run lint --workspace @school-management-system/web`: baseline `187 problems (49 errors, 138 warnings)`; unrelated baseline findings remain unchanged.
- Targeted modified-file ESLint: PASS; no new findings.
- Angular production build: PASS.
- Bundle budget: PASS.
- Template compilation: PASS with the production build.
- Targeted test infrastructure: NOT AVAILABLE; static primitive checks and build verification were used.
- Production source changes: 2 shared primitives only.
- Backend/database/routing/permission changes: 0.
- Browser verification: unavailable.

## Phase 11X resolution matrix

| Finding | Primitive | Severity | Fixed |
| --- | --- | --- | --- |
| Active page was visually indicated but lacked current-page semantics. | `pagination` | A11Y-MEDIUM | YES — `[attr.aria-current]="pageNumber === page() ? 'page' : null'` |
| Standalone textarea consumers had no optional accessible-name input. | `ui-textarea` | A11Y-MEDIUM | YES — optional `ariaLabel` input and native `aria-label` binding |
| Feature overlay keyboard/focus debt. | Feature-owned overlays | A11Y-HIGH | NO — intentionally deferred to 11Y |

### Phase 11X compatibility

- Breaking API changes: 0.
- New required inputs: 0.
- Consumer migrations: 0.
- New positive `tabindex` values: 0.
- New raw colors, directional hacks, dependencies, or accessibility libraries: 0.
- Backend, Prisma, migrations, routes, and permissions: 0.
- `!important`: unchanged at 87.
- `::ng-deep`: unchanged at 4.

## Phase 11X final decision

`SHARED DESIGN SYSTEM ACCESSIBILITY FOUNDATION STABLE`

## Final phase verdict

`PHASE 11W ACCESSIBILITY DESIGN-SYSTEM DEBT AUDIT VERIFIED`

## Phase 11Y — controlled feature remediation record

Phase 11Y selected two standard CRUD screens from the audit-driven feature debt queue:

| Screen | Finding | Severity | Selected |
| --- | --- | --- | --- |
| Classes | Modal and details surfaces used clickable non-interactive containers; close icon lacked an explicit accessible name. | A11Y-HIGH | YES |
| Institutions | Details and edit surfaces used clickable non-interactive containers; the details close control lacked native type/name semantics. | A11Y-HIGH | YES |

### Fixed findings

- Replaced the selected modal backdrop/container click architecture with native backdrop buttons and preserved Escape dismissal on the feature wrapper.
- Added `role="dialog"`, `aria-modal="true"`, and stable `aria-labelledby` references to the selected dialogs.
- Added explicit Arabic accessible names to selected close buttons and `aria-hidden="true"` to their decorative Material Icons.
- Added missing `type="button"` to the selected Institutions details close control.
- No feature API, form validation, navigation, permission, CRUD, or business behavior changed.

### Phase 11Y verification

- Starting commit: `c8527d6`
- Selected screens changed: 2
- Shared components changed: 0
- Specialized overlays/complex workflows/platform/auth: 0
- Accessibility diagnostics: `187 → 179` total lint problems; the 8 selected non-native interaction diagnostics were removed. Remaining lint errors/warnings are baseline findings outside this batch.
- Modified feature files have no remaining click-events-have-key-events or interactive-supports-focus errors.
- Positive `tabindex` added: 0.
- New raw colors, dependencies, routes, backend, Prisma, migrations, or permission changes: 0.
- Angular production build, bundle budget, and template compilation: PASS.
- `git diff --check`: PASS.
- Feature test infrastructure: NOT AVAILABLE.
- Browser verification: unavailable in this execution environment.

### Remaining debt and next phase

The remaining accessibility debt is intentionally deferred: specialized overlays, Exam Results/import workflows, study-group membership, permission matrices, student specialized surfaces, mobile navigation, and the remaining standard feature findings. Shared High findings remain 0.

Recommended next phase (not started):

**Phase 11Z — CONTROLLED FEATURE ACCESSIBILITY REMEDIATION — BATCH 2**

Select the next 2–4 standard screens from `A11Y-HIGH`/`A11Y-MEDIUM` findings. Keep the shared foundation frozen and continue excluding specialized workflows until a dedicated phase is approved.

## Phase 11Y final decision

`FEATURE ACCESSIBILITY REMEDIATION PATTERN PROVEN`

`PHASE 11Y CONTROLLED FEATURE ACCESSIBILITY REMEDIATION BATCH 1 VERIFIED`

## Phase 11Z — controlled feature remediation record

Phase 11Z selected two additional standard CRUD screens from the remaining feature debt:

| Screen | Finding | Severity | Category | Selected |
| --- | --- | --- | --- | --- |
| Academic Years | Icon-only toast and year/period actions relied on tooltip text rather than explicit accessible names. | A11Y-HIGH | Accessible names / native controls | YES |
| Subjects | Icon-only toast and subject/topic/skill actions relied on tooltip text rather than explicit accessible names. | A11Y-HIGH | Accessible names / native controls | YES |

### Fixed findings

- Added explicit contextual `aria-label` values to the selected icon-only actions, including year, period, subject, topic, and skill names.
- Added an explicit accessible name to the toast dismissal button on both screens.
- Preserved native `button type="button"` semantics, existing click handlers, stop-propagation behavior, permissions, confirmations, and CRUD flows.
- No shared component or new component was introduced.

### Regression guard

The selected screens did not introduce new lint findings. During the final verification pass, the previous Batch 1 dialog Escape handlers were also normalized onto their focusable dialog surfaces (`tabindex="-1"`) so the committed baseline contains no `interactive-supports-focus` diagnostics in Classes or Institutions. This was a semantics-only regression guard; no business behavior changed.

### Phase 11Z verification

- Starting commit: `780caaa`
- Selected screens: 2 (`Academic Years`, `Subjects`)
- Classes/Institutions: no new feature work; regression guard only.
- Shared components changed: 0.
- Specialized workflows, Exam Results/import, membership, Platform/Admin, Auth/Security: 0.
- Lint baseline: `179 → 175 problems` (`37 errors`, `138 warnings`); the four previous dialog focus diagnostics were removed and no new findings appeared in the selected screens.
- Positive `tabindex` added: 0.
- New raw colors, dependencies, routes, backend, Prisma, migrations, or permissions: 0.
- Angular production build, bundle budget, and template compilation: PASS.
- `git diff --check`: PASS.
- Feature test infrastructure: NOT AVAILABLE.
- Browser verification: unavailable in this execution environment.

### Remaining debt and next phase

Remaining high-priority work is now concentrated in excluded specialized/complex surfaces: Exams and question/results workflows, Study Group membership, Platform/Admin overlays, mobile navigation, and other feature-specific interaction debt. Shared High remains 0.

Recommended next phase (not started):

**Phase 11AA — CONTROLLED MEDIUM-PRIORITY ACCESSIBILITY REMEDIATION**

Reassess the remaining standard feature findings and select 2–4 screens only after confirming that no standard A11Y-HIGH finding remains. Specialized workflows remain deferred to their dedicated phases.

## Phase 11Z final decision

`STANDARD FEATURE HIGH-PRIORITY ACCESSIBILITY CLOSED`

`PHASE 11Z CONTROLLED FEATURE ACCESSIBILITY REMEDIATION BATCH 2 VERIFIED`

## Phase 11AA — controlled medium-priority remediation record

The high-priority gate was satisfied before this phase: shared and standard-feature High findings were treated as closed; specialized High findings remain explicitly deferred to their dedicated phases.

Selected standard screens:

| Screen | Finding | Category | Severity | Impact |
| --- | --- | --- | --- | --- |
| Staff | Row actions used tooltip-only naming and omitted explicit button type; the profile close control was icon-only without a name. | Accessible names / native semantics | A11Y-MEDIUM | High reuse across staff CRUD tables and safer keyboard/form behavior. |
| Lookup Tables | Row-action icons were not explicitly decorative and action names were generic rather than contextual. | ARIA / status and action semantics | A11Y-MEDIUM | Low-risk correction reused across institution lookup tables. |

### Fixed findings

- Added contextual accessible names to Staff view, edit, assignment, and delete actions.
- Added `type="button"` and explicit naming to the Staff profile close control; marked its icon decorative.
- Added contextual accessible names to Lookup Tables edit/delete actions and marked their icons decorative.
- Preserved all existing handlers, CRUD behavior, permissions, table architecture, and navigation.
- Shared components changed: 0.

### Phase 11AA verification

- Starting commit: `d35c888`
- Selected screens changed: 2 (`Staff`, `Lookup Tables`).
- Previously remediated screens: no changes.
- Specialized workflows, Exam Results/import, permission matrices, membership, mobile navigation, Platform/Admin, Auth/Security: 0.
- Lint baseline: `175 → 175 problems` (`37 errors`, `138 warnings`); no new findings and selected files contain no new errors.
- Positive `tabindex` added: 0.
- New raw colors, dependencies, routes, backend, Prisma, migrations, or permission changes: 0.
- Angular production build, bundle budget, and template compilation: PASS.
- `git diff --check`: PASS.
- Feature test infrastructure: NOT AVAILABLE.
- Browser verification: unavailable in this execution environment.

### Remaining debt and next phase

Standard Feature High/Medium accessibility debt is closed for the audited standard-screen set. Remaining work is specialized or architecture-level: global page titles/landmarks, mobile navigation, loading/feedback policy, low-priority polish, and excluded complex workflows. Shared High/Medium remain 0.

Recommended next phase (not started):

**Phase 11AB — GLOBAL LANDMARK / PAGE TITLE ACCESSIBILITY FOUNDATION**

Audit and implement only the global document title and landmark foundation, with no feature migration or specialized overlay work. Do not start it in this phase.

## Phase 11AA final decision

`STANDARD FEATURE HIGH/MEDIUM ACCESSIBILITY DEBT CLOSED`

`PHASE 11AA CONTROLLED MEDIUM-PRIORITY ACCESSIBILITY REMEDIATION VERIFIED`

## Phase 11AB — global landmark / page title accessibility foundation record

Phase 11AB establishes the application-wide document and landmark foundation only. Feature-screen migrations, shared primitive changes, specialized overlays, mobile drawer behavior, loading/feedback behavior, and all backend or business logic remain out of scope.

### Evidence gate and ownership decision

- Starting commit: `b23a3a1` on `feature/design-system`; the worktree was clean before implementation.
- The root document title was the generic `Google AI Studio Angular App`.
- No Router `TitleStrategy`, route title metadata, or page-local `document.title` writes existed.
- The app shell already owns the application canvas and contains one global `<main id="main-content" tabindex="-1">`, one shell header, one footer, one desktop sidebar, and desktop/mobile navigation landmarks.
- Ownership decision: **APP SHELL OWNS MAIN LANDMARK**. Feature templates retain their existing nested/legacy landmarks for later, explicitly separate remediation phases.

### Implemented foundation

- Replaced the generic root title with `نظام إدارة المؤسسات التعليمية`.
- Added the centralized `AppTitleStrategy`, provided through the Angular router. It uses route `title` metadata and applies the product suffix; routes without a title fall back to the product title.
- Added titles to all 23 navigable application routes, including authentication, account setup, platform administration, dashboard, feature routes, and settings routes. The empty redirect remains untitled by design.
- Added an accessible label to the existing mobile navigation landmark without changing its behavior or interaction model.
- No feature screen, shared component, API, Prisma, route path, permission, dependency, or business behavior was changed.

### Phase 11AB verification

- Production architecture files changed: 4 (`index.html`, `app.config.ts`, `app.html`, and the dedicated title strategy service) plus route metadata in `app.routes.ts`; feature screens changed: 0.
- Global shell landmarks: 1 main, 1 header, 1 footer, 1 sidebar, and 2 named navigation landmarks.
- Navigable route title coverage: 23/23; centralized fallback: PASS.
- Page-local title writes: 0.
- Shared components changed: 0; new raw colors: 0; new dependencies, backend, Prisma, migrations, permissions, or route paths: 0.
- Lint: baseline preserved at `175 problems` (`37 errors`, `138 warnings`); no new findings in the changed files. The command remains non-zero because of the pre-existing baseline.
- Angular production build and template compilation: PASS.
- `git diff --check`: PASS.
- Browser verification: unavailable in this execution environment.

## Phase 11AB final decision

`GLOBAL LANDMARK / PAGE TITLE ACCESSIBILITY FOUNDATION STABLE`

`PHASE 11AB GLOBAL LANDMARK PAGE TITLE FOUNDATION VERIFIED`

## Phase 11AC — mobile navigation accessibility hardening record

Phase 11AC addressed the confirmed accessibility debt in the existing app-shell mobile navigation only. No `ui-drawer`, `DrawerService`, specialized overlay, feature screen, shared primitive, route behavior, API, Prisma, dependency, or business logic work was introduced.

### Evidence gate

- Starting commit: `ecbcc4c` on `feature/design-system`; the worktree was clean before implementation.
- The mobile trigger was a native button but lacked `aria-expanded` and `aria-controls` state wiring.
- The open drawer had no initial focus handoff, keyboard containment, Escape handling, focus restoration, body scroll lock, or resize cleanup.
- The existing mobile nav landmark was named; desktop navigation semantics and all navigation destinations were preserved.
- Mobile navigation accessibility debt confirmed: **YES**.

### Implemented hardening

- Added `aria-expanded`, stable `aria-controls`, and explicit `type="button"` to the mobile trigger.
- Added initial focus to the drawer close control after opening.
- Added Tab and Shift+Tab containment within the open navigation panel.
- Added Escape dismissal, semantic backdrop dismissal, and an explicitly named close button.
- Restored focus to the trigger for close/backdrop/Escape flows; route links close the drawer without forcing focus back to a stale trigger.
- Added body scroll locking with effect cleanup, route-navigation cleanup, and desktop-resize cleanup.
- Marked mobile decorative Material icons `aria-hidden="true"` and preserved native link keyboard behavior.
- Navigation links, destinations, permissions, active state, grouping, desktop sidebar, and route configuration remain unchanged.

### Phase 11AC verification

- App shell/mobile navigation files changed: 2 (`app.ts`, `app.html`); feature screens changed: 0.
- Shared components changed: 0; dependencies, routes, backend, Prisma, migrations, and permissions changed: 0.
- Trigger semantics, accessible naming, expanded state, controls relationship, focus handoff, Tab/Shift+Tab containment, Escape, backdrop, close, route cleanup, scroll cleanup, and resize cleanup: PASS by static/source verification.
- Stale listeners or body-lock state: 0 in the implementation; destroy cleanup is owned by `takeUntilDestroyed` and effect cleanup.
- Lint baseline preserved at `175 problems` (`37 errors`, `138 warnings`); no new findings in changed files.
- Angular production build, bundle budget, and template compilation: PASS.
- `git diff --check`: PASS.
- Tests: NOT AVAILABLE.
- Browser/device focus-loop verification: NOT AVAILABLE in this execution environment.

## Phase 11AC final decision

`MOBILE NAVIGATION ACCESSIBILITY CLOSED`

`PHASE 11AC MOBILE NAVIGATION ACCESSIBILITY HARDENING VERIFIED`
