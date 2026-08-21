# Academic Core Design System

This directory is the current-state architecture record for the Academic Core web application. Phase history is preserved; the latest consolidation sections define the active boundary for new work.

## Current architecture status

| Area | Current status | Ownership |
| --- | --- | --- |
| Design tokens | STABLE | Shared foundation in `_tokens.scss` |
| Buttons and form primitives | STABLE | Shared components |
| Standard school forms | CLOSED | Controlled migration complete |
| Standard tables | CLOSED | Native semantic tables with `.core-table-wrap` / `.core-table` |
| Data display | STABLE | Badge, empty-state, and pagination; loading remains feature-owned |
| Standard modals | COMPLETE | `ui-modal`, 14/14 standard/form coverage |
| Standard confirmations | COMPLETE | `ui-confirm-dialog`, 100% standard coverage |
| Specialized overlays | FEATURE-OWNED / DEFERRED | No shared drawer justified |
| Shared accessibility foundation | STABLE | Shared High findings: 0 |
| Global landmarks and page titles | STABLE | App shell main; Router-owned titles, 23/23 routes |
| Mobile navigation | CLOSED | App-shell focus, keyboard, dismissal, and scroll hardening |

## Ownership rules

- Reuse semantic tokens and existing shared primitives before creating new UI.
- Keep feature data, permissions, forms, API calls, loading, errors, and business transitions feature-owned.
- Keep complex exam, import, membership, security, platform/admin, and specialized overlay workflows feature-owned unless a future audit proves a stable reusable contract.
- Do not add a shared drawer, loading primitive, toast system, or broad lint/CSS cleanup as part of the completed Phase 11 foundation.
- Preserve RTL, responsive behavior, native keyboard semantics, and the app shell's single main landmark.

## Documents

- [TOKENS.md](./TOKENS.md) — token source of truth and usage rules.
- [COMPONENTS.md](./COMPONENTS.md) — shared component contracts.
- [DATA-DISPLAY.md](./DATA-DISPLAY.md) — tables, status, empty, loading, and pagination boundaries.
- [MODALS-OVERLAYS.md](./MODALS-OVERLAYS.md) — modal and confirmation architecture.
- [SPECIALIZED-OVERLAYS.md](./SPECIALIZED-OVERLAYS.md) — feature-owned overlay classification.
- [ACCESSIBILITY.md](./ACCESSIBILITY.md) — accessibility audit, remediation history, and deferred debt.

## Deferred register

Remaining items are non-blocking: legacy lint findings, legacy `!important`/`::ng-deep` and raw-color debt, low-priority accessibility polish, complex/specialized workflow accessibility, loading/feedback future work, and browser/device verification unavailable in the current environment.

## Phase 11 closure

Phase 11 design-system architecture is complete and ready for branch integration / release-readiness review. This is a documentation and boundary decision; it does not authorize a merge, tag, push, or production deployment.
