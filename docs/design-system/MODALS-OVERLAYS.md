# Modal & Overlay Architecture Audit

Phase 11M is an audit and architecture decision only. No production page, shared component, backend, route, Prisma schema, dependency, or interaction flow was changed.

## Inventory summary

The source inventory found 41 `fixed inset-0` roots across 19 application files. This includes modal-like surfaces, the mobile navigation drawer, and a small number of legacy/duplicate template surfaces; the count is therefore a pattern inventory rather than a claim that every fixed root is a modal. There are two active `ui-modal` consumers:

| Area | Current implementation | Classification | Shared status |
| --- | --- | --- | --- |
| Platform provider form | `ui-modal` with projected form/footer | Form modal | Shared shell |
| Lookup tables | `ui-modal` with projected form/footer | Form modal | Shared shell |
| Institutions, Classes, Study groups, Staff | Feature-owned fixed templates | Standard/form/read-only modals | Not shared |
| Academic years, Subjects, Settings | Feature-owned fixed templates | Form and confirmation modals | Not shared |
| Exams and Exam Results | Feature-owned fixed templates/components | Complex/specialized workflow overlays | Not shared |
| Students and Enrollments | Feature-owned templates | Form, import-error, and transfer overlays | Not shared |
| Institution users and Roles | Feature-owned templates | Form modal and right-side sheet/drawer | Not shared |
| Mobile application navigation | Fixed backdrop plus side panel | Drawer | Feature shell |

Confirmation ownership is more consistent than modal ownership: `ConfirmDialogService` has 13 consuming TypeScript files and renders one global `ui-confirm-dialog` host in `app.html`. Some legacy feature templates still contain custom confirmation surfaces.

## Classification boundary

- **Standard modal:** bounded title/body/footer or read-only details with no workflow-specific interaction model.
- **Confirmation dialog:** a focused decision with cancel/confirm actions and a severity variant.
- **Form modal:** a feature-owned form whose data, validation, save state, and permissions remain local to the feature.
- **Complex workflow modal:** multi-section forms, editable grids, question/result workflows, import results, or nested business interactions.
- **Drawer/sheet:** side or edge-aligned surfaces such as mobile navigation and institution-user creation.
- **Specialized overlay:** exam results, study-group membership management, import errors, or another domain-specific interaction.
- **Not actually modal:** toasts, menus, sticky controls, and other fixed-position feedback or navigation surfaces.

The standard/complex boundary is clear. The majority of current surfaces are feature-owned form, complex, specialized, or drawer implementations and must not be forced into a generic dialog API.

## `ui-modal` audit

Current API:

- Selector: `ui-modal`.
- Inputs: `open`, `title`, `closeOnBackdrop`, `closeOnEscape`.
- Output: `closed`.
- Projection: optional `[ui-modal-header]`, `[ui-modal-body]`, and `[ui-modal-footer]` slots.
- Dismissal: backdrop click and Escape are configurable; the native close button emits `closed`.
- Layout: centered `min(100%, 42rem)` surface, internal body scrolling, and a full-width bottom sheet at small widths.

Strengths are semantic `role="dialog"`/`aria-modal`, projected content ownership, token-backed shell structure, configurable dismissal, and a responsive mobile fallback. At the 11M baseline the remaining foundation gaps were focus trapping, return-focus handling, body scroll locking, an explicit accessible description API, configurable size variants, and a stable per-instance title id. Phase 11N resolves those shared-shell gaps without migrating any feature page.

## `ui-confirm-dialog` audit

`ui-confirm-dialog` is already composed over `ui-modal`, not an independent overlay implementation. It owns confirmation copy, severity mapping, cancel/confirm outputs, and shared button usage; `ConfirmDialogService` owns the single active request and resolves it centrally.

Decision: **KEEP `ui-confirm-dialog` composed over `ui-modal`**. No separate overlay service or dialog manager is justified by the current architecture. Confirmation loading and feature-specific pre-confirmation checks remain feature-owned until the foundation API explicitly supports them.

## Cross-cutting findings

### Backdrop, stacking, and positioning

Custom surfaces commonly use `z-50`, with higher values such as `z-[70]`, `z-[9999]`, and the shared shell's `z-index: 1000`. Backdrop opacity, blur, click-to-close behavior, and max-width vary by feature. The application drawer, toasts, menus, and modals are not governed by one stacking contract. This is duplication and a nested-overlay risk, not a reason to introduce a global manager.

### Focus, keyboard, and ARIA

Feature templates commonly use a focusable backdrop with `keydown.escape`; some have explicit `role="dialog"`, while others rely on visible headings without dialog semantics. The shared shell has Escape and close-button behavior but no focus trap or return-focus mechanism. Keyboard access for close actions is generally present where a native button is used. These findings are accessibility quality gaps, not security severity classifications.

### Scroll and responsive behavior

Internal scrolling and viewport caps are implemented per feature. Some forms use `overflow-y-auto`, some use max-height rules, and the shared shell uses an internal body scroll. There is no shared body-scroll lock. Mobile behavior ranges from an edge sheet to a centered shrinking dialog or a full-width overlay.

### Theme and RTL

The shared shell uses design-token variables but still references the older `--color-*` token aliases. Feature overlays mix semantic utility classes, legacy utility colors, and occasional raw values. RTL is mostly preserved through logical layout or `dir="rtl"`, but fixed left/right placement and feature-specific spacing remain inconsistent. No token gap was added in this audit.

### CSS debt

The repository baseline remains `!important = 87` and `::ng-deep = 4`. No new debt was introduced by this audit. No modal-specific `::ng-deep` usage was identified in the inspected modal implementations; existing `!important` findings remain feature-owned and unchanged.

## Architecture decision

**UI-MODAL FOUNDATION READY**

The hardened `ui-modal` is now suitable as the direction for a standard shell and a later controlled migration pilot. The foundation change is intentionally limited to focus containment/restoration, scroll locking, ARIA description support, unique IDs, size variants, and the existing dismissal contract. No page migration is included in 11N.

Complex workflows, specialized result/import surfaces, drawers/sheets, permission matrices, and modal-specific business interactions remain deferred and feature-owned. No global overlay service or generic dialog manager is planned.

## Ownership boundary

Shared architecture may own the shell, backdrop, focus/accessibility behavior, theme integration, dismissal contract, and responsive container. Features retain ownership of content, forms, validation, API calls, loading/error states, permissions, business actions, and workflow transitions.

## Verification scope

- Branch: `feature/design-system`.
- Starting and final commit: `72ea53f`.
- Working tree: clean.
- RC tag `v0.1.0-rc.1`: preserved.
- Production build: already PASS at the 11L-V baseline; no production code changed in 11M.
- `git diff --check`: PASS for this documentation-only change.
- Browser verification: not required for an audit-only phase.

Recommended next phase: `CONTROLLED STANDARD MODAL MIGRATION — PILOT`, limited to two low-risk standard/form modals. Complex workflows, spreadsheet import, exam results, permission matrices, auth/security, platform, and specialized drawers remain excluded.

## Phase 11N hardening record

- `Tab` and `Shift+Tab` are contained within the active modal; a modal with no focusable content focuses its container fallback.
- Initial focus prefers an explicit `[autofocus]` target, then the first focusable control, then the dialog container.
- Focus is restored to the previously active element when it remains connected.
- Body scroll locking is reference-counted and restores the exact prior inline overflow value on close or destroy.
- `aria-modal="true"`, `role="dialog"`, unique `aria-labelledby`, and optional `aria-describedby` are preserved or strengthened.
- `size="sm|md|lg"` is additive and defaults to the existing `md` width; existing consumers require no changes.
- Escape and backdrop dismissal remain controlled by the existing inputs. `ui-confirm-dialog` remains composed over `ui-modal`.

## Phase 11O controlled migration pilot

The pilot started from commit `9425500` on `feature/design-system`, with the RC tag `v0.1.0-rc.1` preserved. Exactly two low-risk form modals in Settings were migrated:

- **Edit institution profile** — standard form, low risk: migrated to `ui-modal` with `size="md"`.
- **Add/edit region** — standard form, low risk: migrated to `ui-modal` with `size="sm"`.

The feature-owned forms, validators, submit handlers, API calls, permissions, loading/error behavior, and cancel actions remain unchanged. The migration removed only each custom backdrop/panel/header shell and delegated dismissal, focus management, ARIA semantics, responsive sizing, and scroll locking to `ui-modal`. No duplicate backdrop, Escape handler, focus logic, or scroll lock was retained. Native feature buttons remain native; no button migration was included.

`ui-confirm-dialog` and all complex, specialized, file-heavy, platform-admin, auth/security, drawer/sheet, and nested-workflow surfaces remain untouched. No modal service, dependency, route, backend, Prisma, or permission change was made. The `ui-modal` production API was not expanded or broken.

Verification classification:

- Targeted Angular lint and template/type compilation are required for the changed Settings component.
- No modal unit tests are present under `apps/web/src`; static migration checks and the relevant Angular build are the available verification paths.
- Production-build font inlining failures caused by the external Google Material Icons stylesheet are environment/network failures. Existing bundle-budget findings are baseline findings and were not changed or relaxed.
- `git diff --check` is required to pass before the migration commit.

The pilot establishes that `ui-modal` can absorb low-risk feature form shells without changing feature ownership or behavior.

## Phase 11P controlled standard modal migration — Batch 1

Batch 1 started from `212234d` on `feature/design-system`. The RC tag `v0.1.0-rc.1` remains preserved. Exactly three low/medium-risk form modals were migrated; the two Settings modals from 11O were not changed:

- **Academic year creator/editor** — Academic Years, form modal, `size="sm"`.
- **Subject creator/editor** — Subjects, form modal, `size="sm"`.
- **Enrollment creator/editor** — Enrollments, form modal, `size="md"`.

Each migration replaced only the feature-owned viewport/backdrop/panel/header shell with `ui-modal`. Reactive Forms, open/close signals, submit handlers, validators, payloads, API calls, loading states, errors, permissions, and existing footer actions remain feature-owned and unchanged. The selected forms had no feature-specific focus trap, scroll lock, or additional Escape behavior requiring preservation. Confirmation, transfer, topic/skill, period, import, exam, permission, drawer, and other excluded surfaces remain untouched.

Foundation status: `ui-modal` and `ui-confirm-dialog` are unchanged; no shared API gap or feature workaround was introduced. The shared shell now owns backdrop, dialog semantics, focus behavior, responsive sizing, and body scroll locking for all five migrated feature modals across 11O and 11P.

Inventory reconciliation after excluding complex/drawer/specialized/confirmation surfaces: 14 Standard/Form candidates; 4 already using `ui-modal` before 11P (including the two 11O Settings modals); 3 migrated in 11P; 7 remaining for a later controlled batch. The 11P custom-shell inventory moved from 39 to 36 `fixed inset-0` patterns across 19 files to 19 files. No new `!important` or `::ng-deep` debt was introduced: `87 → 87` and `4 → 4`.

Verification: targeted lint PASS, Angular production build PASS, bundle budgets PASS without threshold changes, and `git diff --check` PASS. No feature tests or modal foundation tests are available under `apps/web/src`; source/static verification was used. Browser automation was not available in the execution environment.

## Phase 11Q controlled standard modal migration — Batch 2

Batch 2 started from `c3360de` on `feature/design-system`. The remaining Standard/Form inventory was reconciled against source and contained seven candidates:

| Modal | Feature | Classification | Risk | Selected |
| --- | --- | --- | --- | --- |
| Academic period creator/editor | Academic Years | Form | Low | Yes |
| Education type creator/editor | Settings | Form | Low | Yes |
| Staff member creator/editor | Staff | Form | Medium | Yes |
| Topic creator/editor | Subjects | Form | Medium | No |
| Skill creator/editor | Subjects | Form | Medium | No |
| Staff assignment creator/editor | Staff | Form | Medium | No |
| Staff development creator/editor | Staff Development | Form | Medium | No |

The three selected shells were migrated to `ui-modal`: Academic Period `sm`, Education Type `sm`, and Staff Member `md`. Only the custom viewport/backdrop/panel/header/footer shell was removed. Feature forms, validators, open/close state, API calls, payloads, permissions, loading/error behavior, and action handlers remain unchanged. The 11O and 11P migrated modals were not modified.

`ui-modal` and `ui-confirm-dialog` remain unchanged. No generic API gap, feature workaround, duplicate focus/escape/scroll-lock mechanism, dependency, backend, Prisma, migration, or route change was introduced. The custom-shell inventory moved from 36 to 33 `fixed inset-0` patterns across 19 files; `!important` remains `87` and `::ng-deep` remains `4`.

After Batch 2, four Standard/Form candidates remain. Confirmations, complex workflows, drawers/sheets, specialized overlays, platform/auth surfaces, imports, exam results, and permission matrices remain excluded. Verification: targeted lint PASS, Angular production build PASS, bundle budget PASS without threshold changes, and `git diff --check` PASS. No feature or modal foundation tests are available under `apps/web/src`; browser automation was unavailable, so foundation-backed static/source verification was used. The `fixed inset-0` inventory is `36 → 33` patterns across `19 → 18` files.

## Phase 11R final Standard/Form migration

The final reconciliation started from `d9eaffe`. The four remaining candidates were verified against source and all were direct Reactive Form modals, so all four were eligible and migrated:

| Modal | Previous class | Final class | Migrated |
| --- | --- | --- | --- |
| Topic creator/editor | Form | Form | Yes |
| Skill creator/editor | Form | Form | Yes |
| Staff assignment creator/editor | Form | Form | Yes |
| Staff development creator/editor | Form | Form | Yes |

The shells now use `ui-modal` with sizes `sm`, `md`, `md`, and `md` respectively. Open/close conditions, forms, validation, relationships, API calls, payloads, permissions, CRUD behavior, loading, errors, and actions were preserved. No confirmation, complex workflow, drawer/sheet, specialized overlay, table, data-display, or previously migrated modal was changed.

Final Standard/Form architecture status:

- Final Standard/Form total: `14`.
- Using `ui-modal`: `14`.
- Coverage: `100%`.
- Remaining `fixed inset-0` roots are intentionally outside this denominator: confirmations, exam/question/result workflows, spreadsheet/import errors, drawers/sheets, study-group membership, student detail/form surfaces, platform/admin surfaces, and other legacy specialized overlays. Remaining Standard/Form fixed overlays in the reconciled inventory: `0`.
- Fixed-overlay metrics: `33 → 29` patterns, `18 → 17` files.
- CSS debt: `!important 87 → 87`; `::ng-deep 4 → 4`; new debt `0`.

`ui-modal`, `ui-confirm-dialog`, form primitives, table foundations, and data-display primitives remain unchanged. No generic API gap or feature workaround was found. Targeted lint PASS, Angular production build PASS, bundle budget PASS without threshold changes, and `git diff --check` PASS. Feature and modal foundation tests are unavailable under `apps/web/src`; browser verification was unavailable, so foundation-backed static/source verification was used.

**STANDARD MODAL MIGRATION CLOSED**

`ui-modal` is the final foundation for Standard/Form modals. Complex, Drawer, and Specialized overlays remain intentionally outside this architecture. Recommended next phase: `CUSTOM CONFIRMATION CURRENT-STATE AUDIT` only; do not start it automatically.
