# v0.1.0-rc.4

- Release status: Prepared Release Candidate; not published.
- Proposed tag: `v0.1.0-rc.4`; not created by release preparation.
- Base: `v0.1.0-rc.3`, immutable at `4c5a0288c645f13ea55061ee80aa21ca1af9a5c3`.
- Accepted code before release preparation: `e5ae449b7d69171de8bdf46b9fffb62cce1e8d33`.
- Post-RC3 changes: 9 commits before this release-preparation commit.
- Final security cutover and post-RC3 release acceptance: PASS.
- LOCAL SCHOOL OPERATION = READY_HARDENED.
- INTERNET PRODUCTION DEPLOYED = NO.

## UI changes

The seven UI commits unify exam-page content spacing and school-page layout.
School main content uses the available width without a centered outer max-width
cap: inline page padding is 24px on desktop and 16px on tablet/mobile. Shared
wrappers and spacing preserve RTL and responsive behavior.

Intervention and recommendation accents stay inside their cards. Student and
question analysis drawers have refined presentation, and the academic-year
rollover button follows the shared secondary-button contract.

User visual acceptance was recorded for the UI work; this does not claim automated
visual verification. Accepted Web evidence is 339/339 PASS and production build
PASS. The known, pre-existing Dashboard CSS budget warning remains accepted.

## Least-privilege runtime boundary

- `school_app` handles tenant-scoped school operations and approved `school_api`
  capabilities; obsolete direct global identity/session/institution access is removed.
- `school_auth_app` provides the dedicated authentication/session boundary through
  approved `auth_api` capabilities, without direct global-table access.
- `platform_app` retains the dedicated platform paths and privilege contract.

The capability schemas use reviewed SECURITY DEFINER functions with exact
signatures, return types, role/function ACLs and restricted search paths. Their
owner, `school_runtime_definer`, is NOLOGIN and has neither SUPERUSER nor BYPASSRLS
privileges. PUBLIC EXECUTE is denied. The strict verifier checks ownership, schema
and function permissions, overloads, and table/column/default privileges.

## Completed local security cutover

The real local school database completed Stage A runtime switching and Stage B
ACL hardening on PostgreSQL 18.6. Migration state is 37/37, Prisma validation is
PASS, and Prisma drift is NONE.

Stage B removed 12 obsolete direct table grants from `school_app` on `users`,
`user_sessions`, and `institutions`. Required `institution_users`, plan/reference,
school/auth capability and platform privileges were preserved. No additional
column grants needed removal in the captured pre-cutover state.

Strict POST_CUTOVER verification passed twice after revocation and again during
final acceptance. Health/readiness returned HTTP 200; a synthetic nonexistent
login returned normal invalid credentials (401). Auth identity/membership reads,
tenant institution reads, and rollback-only tenant-lock/session probes passed.
No synthetic session persisted and no unexpected valid-path permission errors
were observed.

HARDENED_POST_REVOKE_STATE = ACTIVE. CURRENT_CAPABILITY_RUNTIME = LIVE.
This describes the accepted local installation; preparing RC4 metadata does not
perform another deployment.

## Explicit authentication credential rotation

The canonical password-only recovery entrypoint is:

```powershell
powershell.exe -NoProfile -File apps/api/scripts/install-school-runtime-api.ps1 -RotateAuthPassword
```

Rotation requires explicit opt-in and an existing, safe `school_auth_app` role.
It changes only the password and returns before provisioning; ACL immutability
was verified. Normal installation preserves existing credentials.
`setup-runtime-role.ps1` is not used for auth credential rotation.

Supply secrets through the approved secure deployment environment, never command
arguments, logs or release notes. After successful rotation, securely update
`AUTH_RUNTIME_DATABASE_URL` before the separately controlled runtime switch.
See [School runtime capabilities](../production/SCHOOL_RUNTIME_CAPABILITIES.md)
for the input, logging and operational requirements. The isolated rotation test
passed 1/1, including repeated rotation, old-credential rejection, new-credential
acceptance, negative cases and unchanged ACLs.

## Session operational integrity

`user_sessions` is operational mutable state. A prior digest difference matched
legitimate refresh-style lifecycle churn: the same session ID and user ownership,
with changes limited to refresh hash, expiry, last-used and updated timestamps.
Historical write logs did not directly attribute the request; no identity or hash
values are published here.

Stable business tables retain exact fingerprint requirements: 76/76 matched the
pre-cutover baseline. Session checks use ownership, foreign-key and lifecycle
integrity plus a fresh checkpoint captured after stopping the old API. Acceptance
observed 179 sessions with no unexplained mutation. The pre-existing historical
timestamp anomalies remained unchanged and outside this cutover's scope.

## Release acceptance evidence

The accepted code was verified on a fresh isolated PostgreSQL 18.6 environment
with all 37 canonical migrations, current security provisioning and official
synthetic fixtures. No release suite ran against the real school database.
The canonical Windows command was executed once for final acceptance:

```powershell
npm.cmd run test:api:release
```

| Suite / check | Accepted result |
| --- | --- |
| Canonical API release | 295 total; 293 PASS; 0 FAIL; 2 known rollover SKIP |
| Auth runtime rotation | 1/1 PASS; fresh isolated verification |
| Platform Security | 4/4 PASS |
| Phase10 | 21/21 PASS |
| Current canonical RLS | 7/7 PASS |
| Plan concurrency | 26/26 PASS |
| Initial Admin limits | 15/15 PASS |
| Survey backend | 130/130 PASS |
| Web full | 339/339 PASS; accepted unchanged-frontend evidence reused |
| API build | PASS within the canonical release command |
| Web production build | PASS; accepted unchanged-frontend evidence reused |
| Prisma validate / drift | PASS / NONE |
| Real database migrations | 37/37 |

The subgroup counts are accepted baselines whose unchanged tests are included
in the fresh full API release run; separate subgroup reruns are not claimed.
The two optional rollover integration skips are exactly:

- `successful execute, completed retry, and concurrent execute create one target set`
- `injected midway failure rolls back target rows, maps, decision refs, and RUNNING status`

No new skip was accepted. Temporary test PostgreSQL was stopped and its data and
synthetic secrets removed. Release preparation reuses this evidence without
rerunning the full suite for metadata-only changes.

## Local operation and recovery

This is hardened local school operation, not an internet-production deployment.
The existing official Linux/systemd production-host contract is unchanged.

OLD_RC3_RUNTIME_ROLLBACK = NOT_SAFE_WITHOUT_EXPLICIT_ACL_RESTORATION.
After revoking legacy privileges, running the old RC3 application alone is unsafe.
Default recovery is roll forward with the current capability runtime. Emergency
ACL restoration requires separate explicit review against captured evidence;
there is no automatic restoration or blanket GRANT procedure in this release.

The pre-cutover DB backup was verified, pre/post ACL snapshots were captured,
and the local environment backup and fresh session checkpoint were verified
readable. Machine-local paths and secret values are deliberately omitted.
Local automated backup remains local-only; absence of off-device backup remains
the user's accepted operational risk.

## Post-RC3 changelog

These 9 commits precede the RC4 release-preparation commit:

```text
dfe8cbb fix(ui): unify exam page content spacing
7cb8dc5 fix(ui): unify school page layout spacing
8d58588 fix(ui): keep intervention accent inside card
a7f302c fix(ui): keep recommendation accents inside cards
570612b fix(ui): refine student analysis drawer
70e3f7a fix(ui): refine question analysis drawer
4576501 fix(ui): align academic year rollover button
32f8285 fix(security): enforce least-privilege runtime capabilities
e5ae449 fix(security): support auth runtime credential rotation
```

## Release scope

The post-RC3 batch introduces no Prisma schema change or new migration. Release
preparation changes active package/workspace version metadata and these notes
only; dependency versions, graph, integrity hashes and resolved URLs are unchanged.
Intentional database ACL hardening did occur as documented above.

RC3 and its historical release notes remain immutable. RC4 preparation does not
create a tag, publish a GitHub release, push, merge or deploy. Publication requires
a separate explicit step.
