# Data Display Current-State Architecture

Phase 11G records the current table and data-display patterns without migrating feature pages or introducing a generic table component.

## Inventory

| Area | Classification | Pagination | Actions | Responsive strategy |
| --- | --- | --- | --- | --- |
| Students | Standard table with student form/detail overlays | Shared `app-pagination`; server-backed | View, edit, archive, attendance/grades | Horizontal table overflow plus feature-specific detail views |
| Staff | Standard tables for staff and assignments | Shared pagination plus local page controls | View, edit, archive, assignment actions | Horizontal overflow and local responsive wrappers |
| Enrollments | Standard table with enrollment workflows | Local/server-backed state | View, edit, transfer, archive | Horizontal overflow and feature-specific controls |
| Institutions | Standard table | None observed | View, edit, archive | Horizontal overflow |
| Classes | Standard table | None observed | View, edit, archive | Horizontal overflow |
| Subjects | Standard table/list hybrid | None observed | View, edit, delete | Feature-specific list and modal views |
| Study groups | Standard table plus members workflow | None observed | View, edit, delete, members | Horizontal overflow plus modal/panel views |
| Exams | Complex table | Feature-specific | View, edit, archive, results | Feature-specific responsive treatment |
| Exam results dialog/table | Complex/specialized | None observed | Result editing/import actions | Modal-specific |
| Exam analysis | Specialized data view | None observed | Analysis actions | Analysis-specific layout |
| Exam builder | Matrix/specialized | None observed | Question/editor actions | Specialized editor |
| Academic years | Table/list hybrid with period detail | None observed | Create, edit, delete, activate | Feature-specific split layout |
| Registered students | Table-centric | None observed | Enrollment actions | Horizontal overflow |
| Lookup tables | Standard table | None observed | Edit, delete | Horizontal overflow |
| Institution users | Standard table with create/setup modal | None observed | Create, reissue, deactivate | Horizontal overflow plus modal |
| Audit log | Standard table | Local/server pagination implemented locally | View/filter actions | Horizontal overflow |
| Settings | Multiple standard tables inside modal workflows | None observed | CRUD actions | Feature-specific |
| Dashboard recent enrollments | Compact data list | None | View/link actions | Card/list |
| Student grades/attendance | Specialized tables | None | Specialized academic actions | Feature-specific |
| Platform tables | Platform comparison only | Feature-specific | Platform actions | Out of School UI scope |

Classification counts from the source inventory:

- Standard data tables: 8 primary views.
- Complex data tables: 3.
- Matrix/specialized data views: 4.
- Card/list data views: 1 primary compact list.
- Modal/settings-specific views: several feature-owned tables.

## Current patterns

The implementation uses approximately four table styling systems:

1. Token-backed `surface`/`border` tables in newer screens.
2. Tailwind utility tables using slate/primary palette utilities.
3. Feature CSS table rules in older pages.
4. Specialized matrix, list, or modal layouts that are not generic tables.

Common row behavior is a real `<table>` with `<thead>`, `<tbody>`, repeated `<tr>`, and action cells containing native buttons. Common cells are plain text, secondary text, dates, numeric counts, status pills, avatar/name composites, and icon actions.

The default responsive strategy for standard tables is horizontal overflow. Card conversion and stacked rows remain feature-specific because complex screens use different information density and action placement.

## Row actions and status

Row action semantics are owned by each feature. Existing actions include view, edit, delete, archive, restore, activate, and members/setup actions. Confirmation services and permission visibility remain outside any future table presentation layer.

Status presentation is also feature-owned. The same business concepts appear as token-backed status pills, utility-class badges, text labels, or colored inline spans. A future generic badge may accept only generic `tone`, `size`, and `variant`; it must not know business status names.

Empty states currently include table rows, icon-plus-text blocks, cards, and feature-specific messages. Loading states include table loading rows, text/spinner blocks, disabled content, and inline progress icons. There is not yet enough evidence to force one loading or empty-state component without first choosing a standard visual contract.

## Pagination and data ownership

`app-pagination` is presentational and exposes page, page size, total items, disabled state, page changes, and page-size changes with accessible native controls. It is used by Students and Staff. Audit log and several other views implement local pagination or no pagination.

Pagination, filtering, sorting, fetching, permissions, and confirmation remain feature responsibilities. A future table shell must not fetch data, own query state, map business statuses, or impose server/client pagination.

## Architecture decision

**SHARED TABLE STYLE PRIMITIVES**

Phase 11H proved the smallest useful abstraction with the Institutions pilot. The shared layer is CSS-only and provides two presentation primitives:

- `.core-table-wrap`: horizontal overflow, border, radius, surface, and table-shell framing.
- `.core-table`: semantic table sizing, token-backed header treatment, cell spacing, dividers, row height, hover state, and RTL-safe `text-align: start` behavior.

Institutions retains its native `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, and `<td>` structure. The feature still owns the data projection, fixed column markup, filters, loading and empty states, status rendering, row actions, permissions, confirmation, and any pagination or query state. The shared primitives receive no data, column configuration, fetch logic, or business status knowledge.

Phase 11I migrated the first controlled batch: Staff and Enrollments. Staff contributes two standard table views (members and assignments); Enrollments contributes its enrolled-students table. Institutions remains on the proven pilot foundation. Students, Audit Log, and all other table screens remain untouched. No `ui-table`, `ui-badge`, `ui-empty-state`, or `ui-loading` component was added, and no form-control migration was reopened.

The result is reusable for controlled migration of standard tables whose feature-owned markup fits the same presentation contract. Complex, matrix, specialized, modal-specific, and unusually dense tables should remain feature-owned until a separate pilot proves a narrower need. The table foundation is stable for a second controlled batch.
