# Accessibility Design-System Debt Consolidation

## Phase 11W scope and decision

This document is the Phase 11W audit for the design-system accessibility debt. It is an audit, classification, prioritization, and architecture decision only. No production code, API contract, database schema, route, permission, dependency, or feature behavior was changed.

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
| `ui-textarea` | SMALL GAP | Native semantics are correct, but the primitive lacks the optional standalone `aria-label` input available on the other text controls. |
| `pagination` | SMALL GAP | Native controls and labels are present; the active page should expose `aria-current="page"`. |
| `ui-badge` | PASS with contextual review | Text is not color-only and the icon is decorative. `role="status"` should remain contextual rather than automatic for static labels. |
| `ui-empty-state` | PASS with contextual review | Heading, description, hidden decorative icon, status announcement, and projected action are available. |
| `ui-modal` | PASS | Dialog role, modal semantics, labelled/described references, initial focus, focus trap, focus restore, Escape/backdrop handling, and body-scroll locking are implemented. |
| `ui-confirm-dialog` | PASS | Composes the modal foundation and correctly handles pending confirmation state, disabled dismissal, and loading. |
| Standard table shell | PASS | The shared table presentation is suitable for standard data display; complex feature-specific matrices remain outside this foundation decision. |

### Foundation decision

The shared accessibility foundation is **substantially mature but needs a small hardening phase**. It is not a reason to reopen completed button, form, table, or modal migrations. The smallest shared work is limited to the `pagination` current-page announcement and an optional standalone label input for `ui-textarea`, followed by contract-level regression tests. Feature-level defects must not be solved by weakening or duplicating these primitives.

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

1. Add active-page semantics to pagination.
2. Consider an optional standalone accessible-label input for `ui-textarea`.
3. Preserve existing modal, confirmation, button, form-field, and table contracts; add only contract-level regression coverage in the next foundation phase.

### Feature-specific findings

1. Replace clickable overlay containers with native close buttons or a keyboard-equivalent interaction.
2. Remove ad-hoc container tab stops and implement focus containment/restore per legacy overlay.
3. Review custom dialog ARIA, form associations, table headers, icon names, contrast, and mobile drawer state in controlled feature batches.

The boundary is intentionally strict: shared primitives provide semantics and contracts; features own their overlay lifecycle, data shape, labels, and complex table structure.

## Prioritized remediation queue

| Priority | Scope | Deliverable | Excluded |
| --- | --- | --- | --- |
| 1 | Shared foundation | Pagination `aria-current`, optional textarea label contract, focused regression checks. | Feature migration, redesign |
| 2 | Legacy specialized overlays | Keyboard dismissal, focus containment/restore, dialog naming, and removal of container-tabindex workarounds in one controlled batch. | New generic drawer/sheet primitive |
| 3 | Feature forms and controls | Label/error association, icon names, native button/link semantics, and representative contrast checks. | API/business changes |
| 4 | Complex data display | Header scope/relationships and keyboard review for exam/results/permissions matrices. | Replacing standard table shell |
| 5 | Global polish | Route titles/headings, mobile nav state/return focus, reduced motion, and landmark consistency. | Broad visual redesign |

## Architecture decision and next phase

Decision: **MIXED — small shared foundation hardening, then controlled feature accessibility batches.** The shared foundation is close to complete and should receive only the two bounded contract improvements above. The larger debt is feature-owned and concentrated in legacy custom overlays, so a new universal overlay abstraction is not warranted.

Recommended single next phase (not started):

**Phase 11X — ACCESSIBILITY SHARED FOUNDATION HARDENING**

Scope only the pagination active-page announcement, the optional `ui-textarea` accessible-label contract, and focused shared-component regression checks. After 11X is verified, schedule feature batches for legacy overlays and complex data displays. No Phase 11X work is performed by this document.

## Verification record

- `git status --short --branch`: clean at the start of Phase 11W.
- `git rev-parse HEAD`: `69f20f019d08fceb1aaf7215444b028ead565dcc`.
- `npm.cmd run lint --workspace @school-management-system/web`: baseline `187 problems (49 errors, 138 warnings)`; no lint fixes were applied.
- Angular production build: last known pass from Phase 11U; not rerun for this docs-only phase.
- Production source changes: 0.
- Backend/database/routing/permission changes: 0.
- Browser verification: unavailable.

## Final phase verdict

`PHASE 11W ACCESSIBILITY DESIGN-SYSTEM DEBT AUDIT VERIFIED`
