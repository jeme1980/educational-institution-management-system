# Dashboard exam status accuracy audit

Verified on 2026-09-24, starting from `17185aa7df79f4d4d331b4812bbf9da2d7bc83cf`
on `feature/school-admin-workspace`. The pre-existing user edit to `AGENTS.md` is excluded.

## Pipeline and original semantics

- Component/template: `apps/web/src/app/pages/dashboard/pages/dashboard.component.{ts,html}`.
- Client: `ApiService.loadDashboardStats()` delegates to `SettingsApiService.loadDashboardStats()`;
  `BaseApiService.apiFetch()` sends the selected institution/year context headers.
- Route: `GET /api/dashboard/stats`, in `general.routes.ts`, authenticated and permission checked.
- Controller: `general.controller.ts::getDashboardStats` validates the year against the institution.
- Service: `dashboard.service.ts::getDashboardStats` calls `academicAnalytics` and caches by institution/year for five minutes.
- DTO: `DashboardStats.skillPerformance` in the backend service and frontend `core/models/api.models.ts`.
  The separate legacy `pages/dashboard/models/dashboard.model.ts` is not used by this component.
- Database: `Exam`, `ExamQuestion`, `StudentQuestionScore`, `StudentExamResult`, `Skill`, `Topic`;
  `AcademicYear` supplies context, `Subject` supplies the adjacent subject summary.
  Questions have independent optional Skill and Topic relations. No Skill → Topic hierarchy exists.

The original `average` was `sum(raw question scores) / number of score rows`. It was neither
an impact/delta nor normalized mastery. It ranked larger raw averages first, favoring questions
with larger maxima. The template actually said “أبرز المهارات والمواضيع”, without a unit.
It did not check question-score students against present exam results. No dedicated tests
for this computation existed. Existing exam-analysis code identifies attendance through
`StudentExamResult.isAbsence`, and the result writer removes missing question-score rows.

## Final contract

Backend is the calculation source of truth. For both skills and topics:

`performance = sum(earned over scored present observations) / sum(question.maxScore over the same observations) * 100`

Weighted aggregation: **YES**. No exam.maxScore divisor, double normalization or average of
question averages. DTO shape is unchanged; `average` now means 0–100 performance and `count`
means scored question observations, not unique students. Round once to two decimals.

- Exam scope: selected institution/year, `archivedAt = null`. Publication is not a gate in
  the established dashboard or school-dashboard analytics contract; no draft/status field exists.
- Completion remains **examDate before now AND at least one recorded exam result**.
  This is the existing dashboard classification, not a claim that every student is graded.
- Year: explicitly selected client year; authenticated current year only if no year was supplied.
  Ownership is checked by tenant middleware and controller; no first-year fallback.
- Nested queries explicitly filter institution; dimension ownership/year are checked too.
  RLS, permissions and database roles are unchanged.
- Exams are queried directly, never expanded through study groups. Scores are unique by
  `(examQuestionId, studentId)`. Each observation contributes once to its skill and once to
  its independently linked topic. Rows are identified by kind + ID, not by name.
- Absent students and scores without a present result are excluded. Present zero contributes.
- Missing score rows and null scores are excluded, not converted to zero; database score is
  non-nullable, and unscored input is represented by no row. Invalid/nonpositive maxima are excluded.
- Ranking is descending normalized performance, with deterministic kind/ID ties. Backend keeps
  the existing top-12 limit; UI keeps the existing top-five display.
- Heading: “المهارات والمواضيع الأعلى أداءً”; unit `%`; shared neutral `ui-badge` for مهارة/موضوع.
- Empty message: “لا توجد بيانات كافية لتحليل المهارات والمواضيع.”

## Development database evidence

Institution `00000000-0000-4000-8000-000000000001`, year
`00000000-0000-4000-8000-000000000007` (2025-2026, current).
Read-only transactions under `school_app`, `rolbypassrls=false`; no data writes.

Original first row, skill “فهم - معرفة  - تحليل” (`52119ca7-1f92-4437-8f73-2e99a97fea13`):
question `f640c256-8186-4e75-83b3-a87e1e9e1027`, number 1, max 20;
59 scored/present students, earned 904, possible `59 * 20 = 1180`.
Old `904 / 59 = 15.32`; corrected calculation `904 / 1180 * 100 = 76.61%`.

Original second row, skill “تعبير” (`2324e7b5-9d4e-4457-9228-20d274eac69b`):

| Question | Max | Observations | Earned | Possible |
|---|---:|---:|---:|---:|
| 25 (`560b0f24-b551-4e26-8bdd-411a5595389a`) | 25 | 58 | 916 | 1450 |
| 32 (`5ffa60ab-2c92-4f3d-9b4e-3e58e1f9048e`) | 20 | 61 | 818 | 1220 |
| Total (63 unique students) | | 119 | 1734 | 2670 |

Old `1734 / 119 = 14.57`; corrected calculation `1734 / 2670 * 100 = 64.94%`.
Direct topic “ تعبير” (`573f7201-bf00-4339-b719-4b6a48b505d3`) has the same totals.
After correct ranking these three dimensions rank 35, 82 and 83, respectively: they are
outside the returned top 12, so the UI no longer displays them. These are independently
calculated corrected values, not claims that the truncated DTO returns those old rows.

Independent SQL aggregates exactly matched **every returned DTO row**, including these new visible rows:

| Name | Kind | Earned | Possible | Observations / students | Expected | DTO after fix |
|---|---|---:|---:|---:|---:|---:|
| قيمة الرقم في العدد | Skill | 156 | 165 | 55 / 55 | 94.55% | 94.55% |
| المتواليات العددية | Skill | 295 | 318 | 53 / 53 | 92.77% | 92.77% |
| تحديد نوع الطاقة (صور) | Topic | 220 | 240 | 60 / 60 | 91.67% | 91.67% |

SQL completed count = service count = **30**. All 30 active exams link to multiple study groups;
none are multiplied. 29 are unpublished, retained according to the existing contract.
2026-2027 has zero exams/analytics; 2025-2026 has 30 active exams. Foreign exam visibility under
the current RLS context is zero. Unit fixtures also include foreign tenant, other year and archived exams.

Reproduce (after API build):

```sh
node apps/api/scripts/dashboard-impact-proof.cjs 00000000-0000-4000-8000-000000000001 00000000-0000-4000-8000-000000000007 52119ca7-1f92-4437-8f73-2e99a97fea13 2324e7b5-9d4e-4457-9228-20d274eac69b
```

## Verification and scope

- Backend targeted tests: **8 passed** (5 new dashboard tests + 3 existing school-dashboard tests).
- Frontend targeted tests: **7 passed**, including rendered counts, percentages, ordering, badges,
  identities, top-five limit and empty state.
- API TypeScript build: **PASS**.
- Angular production build: **PASS**, only the pre-existing Dashboard CSS budget warning.
- ESLint for the modified frontend TypeScript/template files: **PASS**.
- `git diff --check`: **PASS**.
- Angular build/tests required execution outside the filesystem sandbox after access-denied failures.
- Visual browser inspection: **not performed**; no browser automation tool was available.
  UI assertions used the rendered Angular DOM in the test environment. Runtime proof calls the
  built backend service, not an authenticated HTTP/browser session.

Backend changed: **YES**. Frontend changed: **YES**. Schema/migrations: **NO**.
Stored results, grading, question relations, permissions and the global normalization contract are unchanged.
The adjacent subject-results summary is outside this fix.
