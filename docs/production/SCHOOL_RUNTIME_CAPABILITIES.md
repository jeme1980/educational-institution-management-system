# School and authentication runtime capabilities

## Runtime domains

`school_app` is the existing tenant runtime. `school_auth_app` is a separate LOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION role because authentication needs a dedicated PostgreSQL connection. It owns no objects, has no memberships, and has no direct table or column access to users, user_sessions, or institutions. `platform_app` retains the existing dedicated platform architecture. Neither school nor authentication runtime receives platform audit table privileges.

`AUTH_RUNTIME_DATABASE_URL` must explicitly identify school_auth_app. There is no owner, school, or platform fallback. The Prisma client is private inside auth-runtime.repository.ts, which exports only named authentication capabilities and lifecycle/readiness functions. School services use school-runtime.repository.ts and the existing transaction-bound school client. JWT/tenant middleware is part of the authentication boundary.

The non-login school_runtime_definer owns the functions, not tables. It receives exact required identity/session column rights, own-institution SELECT/profile-column UPDATE, membership archive metadata SELECT, and INSERT on audit destinations. The latter privileges are exercised solely by the atomic credential-change function. Global identity/session tables have no RLS; auth functions are deliberately global AUTH capabilities, never school tenant capabilities. Audit RLS remains enabled and its tenant context is derived from a verified active membership.

## Exact grants

All functions have SECURITY DEFINER, search_path=pg_catalog, pg_temp, qualified relations, typed parameters/results, no dynamic SQL, no PUBLIC execute, and no runtime schema CREATE. The reviewed exact signatures/results are independently versioned in scripts/runtime-function-contracts.cjs. The installer removes the previous global school_api functions without CASCADE; unexpected dependencies stop installation.

| EXECUTE role | Schema | Functions |
| --- | --- | --- |
| school_app | school_api | lock_institution, school_accounts, school_create_identity, school_setup_stamp, school_revoke_pending_sessions, institution_record, institution_profile_update |
| school_auth_app | auth_api | auth_login_identity_email, auth_identity_id, auth_memberships, auth_failed_login, auth_successful_login, auth_upgrade_password, auth_password_identity, auth_change_password, session_create, session_id, session_hash, session_rotate, session_revoke_hash, sessions_revoke_current |
| platform_app / PUBLIC | Both | None |

The authentication role is a trusted authentication service identity: it can resolve a concrete global user and create sessions after application password verification. Possession of its connection is an authentication-domain compromise. The split prevents a school SQL connection from inheriting that trust; it does not claim protection against compromised authentication-service code. Membership lookup deliberately preserves existing active/archive selection and multi-institution behavior and returns no profile data.

## Flow boundaries

| Flow | Role / capability | Target / audit |
| --- | --- | --- |
| School login | school_auth_app: auth_login_identity_email, auth_memberships, metadata, optional auth_upgrade_password, session_create | Exact email; Argon2 verification occurs before session creation; school context reads use school_app/RLS |
| Platform login | Same AUTH capabilities | Exact platform identity; platform services still use platform_app |
| JWT / Me | school_auth_app: auth_identity_id, session_id, auth_memberships | Hash-free identity state, minimal session/membership state |
| School password change | school_auth_app: auth_password_identity, auth_change_password | Derive identity from live JWT sid; app verifies current password; DB compares expected credential hash and active membership; atomic password/stamp/session invalidation + school audit |
| Platform password change | Same functions | Derive platform identity from live sid; atomic password/stamp/session invalidation + platform audit; no school audit INSERT attempt |
| Refresh | school_auth_app: session_hash, auth_identity_id, auth_memberships, session_rotate | Refresh-hash possession + CAS; DB server UTC statement time, revoked/expired rejection; replay denied |
| Logout | school_auth_app: session_revoke_hash | Refresh-hash possession only; random session UUID cannot be supplied as revocation key |
| Logout-all | school_auth_app: sessions_revoke_current | Live session ID from a server-verified access JWT; userId is derived, not caller selected |
| Account setup | Existing platform_app one-time setup-token transaction | Existing token hash/expiry/single-use checks, school/platform audit; no new generic password reset capability |
| School setup reissue | school_app: school_setup_stamp, school_revoke_pending_sessions | Pending identity linked to transaction tenant; existing permission checks and audit |

Password changes require a current session-bearing access token; old sid-less tokens must sign in again. Session revocation does not change identity role, status, permissions, or memberships. The atomic password function rolls back credential changes, stamp, session revocation and audit together on any failure. Login legacy hash upgrades compare the exact normalized email and previous hash; they cannot change arbitrary UUID credentials.

Refresh lifetime is 30 days by default and at most 30 days; shorter positive REFRESH_TOKEN_TTL_DAYS settings remain supported. The application clamps invalid/excessive values to the canonical default, and deployment rejects values above 30. DB capabilities allow a one-minute clock tolerance on the 30-day maximum and always use server time for expiry checks. No caller p_now exists.

School account creation/linking returns only id and mustChangePassword, retains non-platform multi-institution account linking, and uses current-tenant context. Own-institution settings remain five explicit fields. lock_institution validates requested ID against the transaction-local tenant GUC and acquires FOR NO KEY UPDATE through the same transaction client; count/decision/write remain in that outer transaction through AsyncLocalStorage. GUC is trusted application context after membership authentication, not an independent user proof.

## Controlled cutover

1. Apply the existing 37 migrations and canonical role provisioning.
2. Install install-school-runtime-api.ps1 with deployment credentials and AUTH_RUNTIME_DB_PASSWORD. Installation is additive for legacy table grants. Existing role passwords are preserved; this is not a credential rotation command.
3. Run `node scripts/verify-production-db.cjs --mode pre-cutover`. The mode is mandatory. Ownership, exact signatures/results, role separation, effective table/column privileges, schema CREATE and default privileges are checked. Only school_app legacy global grants can remain temporarily; they are explicitly printed as PENDING_LEGACY_REMEDIATION. Auth runtime direct grants are always fatal.
4. Publish/switch runtime with the explicit AUTH_RUNTIME_DATABASE_URL and check health, readiness, school/platform login, refresh/logout/password changes and plan limits. PRE_CUTOVER alone is never deployment acceptance.
5. Immediately before legacy revoke, capture the read-only effective ACL checkpoint below. After explicit operational approval, execute apps/api/scripts/sql/school-runtime-legacy-revoke.sql with the deployment credential. It removes only school_app table/column privileges on users, user_sessions, institutions. It does not touch institution_users, lookup/reference SELECT or plans. It is separate, transactional and rerunnable; use psql --no-psqlrc --set ON_ERROR_STOP=1 --file with the approved deployment connection. No script invokes it automatically.
6. Require `node scripts/verify-production-db.cjs --mode post-cutover`, then repeat final runtime health/readiness and auth/session/password/plan smoke checks. Both table and column legacy access must be absent. Only this phase plus final runtime smoke validation accepts deployment.

No real school install, ACL change, restart or cutover is authorized by this implementation.

## Rollback ACL compatibility checkpoint

Before `school-runtime-legacy-revoke.sql`, legacy direct grants remain: both the capability runtime and the old RC3 runtime have their required DB privileges. Application rollback to RC3 remains technically possible only if no other incompatible application/schema change exists. `PRE_REVOKE_ROLLBACK=APPLICATION_ROLLBACK_POSSIBLE`. This is application rollback, not migration rollback.

After successful revoke, RC3/old direct-table runtime is not compatible with hardened ACLs. **Do not restore RC3 application code alone.** The default recovery is **ROLL FORWARD / redeploy the new auth-capability runtime**. `POST_REVOKE_OLD_RUNTIME_ROLLBACK=NOT_SAFE_WITHOUT_EXPLICIT_ACL_RESTORATION`.

| State | Old RC3 runtime safe? | New capability runtime safe? | Required action |
| --- | --- | --- | --- |
| PRE_REVOKE | YES, if otherwise compatible | YES | Normal application rollback possible; preserve DB migrations. |
| POST_REVOKE | NO | YES | Keep/redeploy capability runtime; roll forward. |
| LEGACY_GRANTS_TEMPORARILY_RESTORED | YES, if precisely restored and otherwise compatible | YES | Temporary reviewed emergency recovery only; not hardened final state. |
| POST_REVOKE_HARDENED | NO | YES | Expected final state after strict verifier and final runtime smoke pass. |

Immediately before revoke, use the approved deployment connection to record the relevant effective table and column privileges for `school_app` on `users`, `user_sessions`, and `institutions`. Keep the timestamped record securely outside the application release, with the release identity and operational approval. It is an audit/emergency restoration reference, not an executable restore script. Capture metadata only, never passwords or user/session rows. For example, the following checkpoint is read-only:

```sql
BEGIN READ ONLY;
SELECT current_database() AS database, current_user AS recorder,
       CURRENT_TIMESTAMP AS captured_at;
SELECT n.nspname AS schema, c.relname AS object,
       pg_get_userbyid(c.relowner) AS owner, c.relacl AS direct_acl,
       p.privilege, has_table_privilege('school_app', c.oid, p.privilege) AS effective_allowed
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
                   ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
WHERE n.nspname='public' AND c.relname IN ('users','user_sessions','institutions')
ORDER BY c.relname,p.privilege;
SELECT c.relname AS object, a.attname AS column, a.attacl AS direct_column_acl,
       p.privilege, has_column_privilege('school_app',c.oid,a.attnum,p.privilege) AS effective_allowed
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE n.nspname='public' AND c.relname IN ('users','user_sessions','institutions')
ORDER BY c.relname,a.attnum,p.privilege;
COMMIT;
```

If emergency old-runtime recovery is unavoidable after revoke, restoration of the precise required legacy privileges must first be explicit, reviewed and authorized against that checkpoint. There is no automatic restoration and no blanket GRANT artifact. Once legacy privileges are restored, hardened POST_CUTOVER verification **must fail by design**. Classify the environment as `LEGACY_GRANTS_TEMPORARILY_RESTORED`, never final hardened production. Recover by redeploying the capability runtime, repeating runtime smoke checks, explicitly revoking obsolete grants again, rerunning POST_CUTOVER, and repeating final smoke checks. The state transition is `POST_REVOKE -> LEGACY_GRANTS_TEMPORARILY_RESTORED -> POST_REVOKE_HARDENED`; successful emergency recovery alone does not accept the hardened state.

## Isolated verification

Tests use actual school/auth/platform runtime roles for capability checks and administrator only for synthetic fixtures and deliberate bad-ACL/overload scenarios. They exercise platform password-change rollback on audit failure and both verifier modes. Historical RLS 8/8 is documentation drift / insufficient reproducible historical evidence; the discoverable current canonical RLS selection is **7/7**. Historical RC3 release notes are not rewritten.

## Canonical API release suite

**THIS SUITE MUST NOT RUN AGAINST THE REAL `school` DATABASE.** Prepare a disposable PostgreSQL 18.6 instance outside the repository on `127.0.0.1`, unused port **>=55005**, with a non-`school` database and synthetic fixtures only. Before running the command:

- Apply all 37 canonical migrations and the canonical school/platform role setup, Platform Metrics API, Provider DELETE hardening, final Platform privilege hardening, and school/auth capability installer. No ad-hoc grants are required.
- Prepare official production reference bootstrap, development seed and school analytics demo fixtures using their existing entrypoints (`db:bootstrap`, `db:seed:dev`, `seed:demo`) only on the guarded disposable target. Use deployment/admin credentials for fixture setup only; tests must keep school/auth/platform runtime URLs restricted. Set `DEMO_SEED_CONFIRM=school-analytics` for demo fixtures and supply synthetic fixture/admin passwords. The seed's administrative connection override is a setup-child-process operation only, never the test/runtime connection.
- Explicitly supply `NODE_ENV=test`, `DATABASE_URL`, `TEST_ADMIN_DATABASE_URL`, `MIGRATION_DATABASE_URL`, `RLS_RUNTIME_DATABASE_URL`, `AUTH_RUNTIME_DATABASE_URL`, and `PLATFORM_DATABASE_URL`. All database URLs, including optional specialized runtime URLs, must identify the same disposable host/port/database. The three runtime URLs must use `school_app`, `school_auth_app`, and `platform_app` respectively. Supply `PSQL_PATH` for the approved PostgreSQL client used by boundary artifact tests, plus the existing synthetic JWT/setup fixture environment. Keep owner credentials limited to migrations, fixtures and metadata/scenario probes.

Run the single canonical command from the repository root:

```sh
npm run test:api:release
```

Windows equivalent: `npm.cmd run test:api:release`.

The package script composes the existing API build with `apps/api/scripts/run-release-tests.cjs`. The runner uses only Node built-ins, discovers all regular `*.spec.js` and `*.test.js` files recursively under `apps/api/dist`, sorts normalized relative paths lexically without locale dependence, and runs the current Node executable with `--test --test-concurrency=1`. No rg, PowerShell enumeration, shell glob, CLI file override or separate boundary release command is used. Stdio is inherited and test failure exit status is propagated. The runner does not rewrite environment variables or perform provisioning. It refuses missing/unsafe DB configuration, non-loopback/source targets, mixed DB targets, zero tests, symlinks or missing boundary files before executing tests.

The required boundary files are `security/auth-runtime-boundary.spec.js` (three tests: B1/B2, B3, B4/B5) and `security/school-runtime-api.spec.js` (one capability/tenant-lock test). They are discovered and executed once each, as part of the official full API release suite. For the current RC4 security state the expectation is **295 total, 293 PASS, 0 FAIL, 2 SKIP** (the original 291 plus these four). This is a documented current baseline, not a permanent runner test-count limit.

With `RUN_ROLLOVER_INTEGRATION` disabled, the two skips are exactly the optional rollover execution integration cases: completed/retried/concurrent execution, and injected mid-execution rollback. No failure is converted to SKIP. Repeating the same canonical command on a cleaned, still-prepared disposable database should produce the same results; if fixture cleanup fails, diagnose it instead of changing assertions or silently accepting a different count.
