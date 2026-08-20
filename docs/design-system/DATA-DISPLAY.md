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

**NO GENERIC TABLE YET**

The smallest safe abstraction is not proven yet. Standard tables share semantic HTML and broad layout concepts, but their pagination ownership, status rendering, row actions, responsive behavior, and loading/empty states still differ. A full column-configuration table would over-generalize the current codebase.

The recommended direction for Phase 11H is a controlled, presentational table-shell pilot around one low-risk standard table. Keep native table semantics, project headers/rows/actions, and keep all data and business state in the feature. Re-evaluate `ui-badge` and `ui-empty-state` only after that pilot exposes repeated contracts.

No `ui-table`, `ui-badge`, `ui-empty-state`, or `ui-loading` component was added in Phase 11G.
