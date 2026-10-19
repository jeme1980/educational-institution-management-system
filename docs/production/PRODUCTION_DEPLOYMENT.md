# Production Deployment Runbook

## Scope and topology

The official production API runtime is Linux + systemd, with Ubuntu 24.04 LTS as the verified baseline. Windows remains supported for development and existing operator/deployment preparation tooling; Windows child-process SIGTERM behavior is not a production supervisor requirement.

The supported topology is:

```text
Browser -- HTTPS --> reverse proxy --> Web SPA
                              \--> /api --> API --> PostgreSQL
```

The reverse proxy terminates TLS, redirects HTTP to HTTPS, serves the SPA artifact, forwards `/api` to the API process, preserves the original host/protocol headers, and applies a request body limit of at least 10 MB for the spreadsheet import route. The existing `app.set('trust proxy', 1)` contract requires exactly one trusted reverse-proxy hop; restrict direct client access to the API and have that proxy set the forwarded headers.

Artifacts and working directories:

| Component | Artifact | Start method |
| --- | --- | --- |
| Web | `apps/web/dist/app/browser` | `npm run start:web` |
| API | `apps/api/dist` | `educational-institution-api.service`, direct `/usr/bin/node .../apps/api/dist/server.js` |

Run the single preparation entrypoint from a trusted release checkout on Windows PowerShell. It performs `npm ci --include=dev` (build tools are development dependencies), builds both artifacts, upgrades and verifies the database, and stops on the first failure. It prepares the release and database; it does not own the long-lived API PID. The deployment operator/pipeline publishes the validated release to the Linux runtime host and invokes systemd after preparation succeeds. `scripts/start-api.mjs` remains an operator/development entrypoint and is not part of the production systemd service chain.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-production.ps1
```

## Environment contract

Copy the variable names from `.env.example` into the deployment secret store. Never commit or print values. Production requires:

- `NODE_ENV=production`, `AUTH_JWT_SECRET`, token TTLs, `PORT`, `CORS_ORIGINS`, and `APP_URL`.
- `RLS_RUNTIME_DATABASE_URL` for `school_app`.
- `PLATFORM_DATABASE_URL` for `platform_app`.
- `AUTH_RUNTIME_DATABASE_URL` for capability-only `school_auth_app`; `AUTH_RUNTIME_DB_PASSWORD` only for provisioning.
- `REFRESH_TOKEN_TTL_DAYS` must be positive and at most 30.
- `MIGRATION_DATABASE_URL` for migrations/bootstrap only.
- `ACCOUNT_SETUP_URL_BASE` as a public HTTPS `/account/setup` page, without a token or localhost address.
- `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` only during the explicit bootstrap operation; remove or rotate them immediately afterward.

`school_app` and `platform_app` must be `NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT`, and must have no role memberships. Prisma's schema names `DATABASE_URL`; `apps/api/scripts/run-prisma-migration.ps1` maps `MIGRATION_DATABASE_URL` to it only within the Prisma child process for validate/status/deploy. The API supervisor must not receive `MIGRATION_DATABASE_URL` or a migration-valued `DATABASE_URL`. Its connections are `RLS_RUNTIME_DATABASE_URL`, `AUTH_RUNTIME_DATABASE_URL`, and `PLATFORM_DATABASE_URL`, using separate school/auth/platform runtime roles.

## Fresh deployment order

1. Create an empty PostgreSQL database and configure deployment and restricted runtime secrets in the secret store. Take and verify a backup before upgrading an existing database.
2. Run `scripts/deploy-production.ps1`. Its preflight validates all required variables and the HTTPS account-setup URL before changing the database. `-ValidateOnly` runs this check without install, build, or DB writes.
3. The helper runs `npm ci --include=dev`, builds API and Web artifacts, then provisions `school_app` and `platform_app` before migration because migrations grant those roles privileges.
4. It runs Prisma validate and migrate status through `run-prisma-migration.ps1`; a fresh database's *unapplied migrations* status is accepted. It then runs `prisma migrate deploy` with the migration credential and requires post-migration status success.
5. It repeats both role-provisioning commands because new migration tables need their grants and policies.
6. It installs Platform Metrics (`db:install-platform-metrics-api`), then Provider DELETE hardening (`db:install-provider-delete-hardening`), then final Platform privilege hardening (`db:install-platform-final-privilege-hardening`). These are mandatory on both fresh and upgrade runs. The deployment credential needs the role-management rights required by the Metrics installer.
The helper also runs `apps/api/scripts/install-school-runtime-api.ps1` to install the versioned school identity/session/tenant-lock capabilities. See [SCHOOL_RUNTIME_CAPABILITIES.md](SCHOOL_RUNTIME_CAPABILITIES.md) for the separate legacy-ACL cutover gate.

7. It runs idempotent production reference bootstrap and `scripts/verify-production-db.cjs`, which checks migration history, restricted role attributes/memberships, Provider DELETE denial, seven direct SELECT denials, and Metrics execute privileges. The helper uses explicit pre-cutover mode, reports pending legacy grants, and stops on any capability-contract failure. This is preparation only, not deployment acceptance.
8. Publish the validated release, including `apps/api/dist`, package metadata and compatible production dependencies, to `/opt/educational-institution-management-system/current`. Install/start `educational-institution-api.service` as described below; for an existing enabled service, invoke `sudo systemctl restart educational-institution-api.service` after release and database preparation succeeds. The service directly executes the built API, with no npm/shell wrapper, port cleanup, or migrations. On an occupied port the new API fails; coordinate rollout through systemd.
9. After switching runtime, run school/platform auth/session/password and plan smoke checks; execute the separately approved legacy revoke artifact, then require `node scripts/verify-production-db.cjs --mode post-cutover` before acceptance. See [SCHOOL_RUNTIME_CAPABILITIES.md](SCHOOL_RUNTIME_CAPABILITIES.md). Check `GET /api/health` and `GET /api/ready` for HTTP 200 before routing traffic to the new API. Readiness checks both restricted database clients.
10. Publish `apps/web/dist/app/browser` and serve it via the HTTPS reverse proxy or `npm run start:web` behind that proxy. Confirm `/api` forwarding and SPA deep-link fallback; do not use Angular's development server in production.

Do not use `migrate dev`, `db push`, `migrate reset`, or `db:seed:dev` in production.

The role scripts use `psql` when available. On hosts where it is not on `PATH`, set `PSQL_PATH` to the approved PostgreSQL client binary before provisioning. Existing role passwords are preserved by default; use `-RotatePassword` only as an explicit credential-rotation operation. The role and hardening installers are safe to rerun: provisioning reapplies grants, Metrics replaces its functions, and the two hardening SQL artifacts repeat `REVOKE`/`NOINHERIT`. `migrate deploy` is a no-op when current.

## Reverse proxy requirements

- Redirect HTTP to HTTPS and forward `X-Forwarded-Proto` and `X-Forwarded-For`.
- Route `/api` to the API upstream without rewriting the API prefix.
- Serve static assets with immutable caching and `index.html` with no-store caching.
- Send unknown browser routes to `index.html`; return 404 for missing asset paths and API paths.
- Allow at least 10 MB request bodies for the spreadsheet import endpoint.
- Apply HSTS only on the HTTPS production virtual host.
- Do not add a second, conflicting CSP policy. The SPA server already emits the policy defined in Phase 10C-5.

## Health, monitoring, and process management

- `/api/health` is liveness and should return HTTP 200 while the process is alive.
- `/api/ready` checks both restricted database clients and returns HTTP 503 when either dependency is unavailable or privileged.
- Alert on readiness failure, repeated process restarts, database errors, HTTP 5xx rate, backup failure, and storage exhaustion.
- systemd owns the direct Node API MainPID, startup, SIGTERM delivery on stop/restart, restart-on-failure, enabled boot startup, runtime environment injection, and journal capture. The application does not self-restart.
- The API closes its HTTP listener and disconnects both Prisma clients on SIGTERM/SIGINT. The SPA server closes its listener on the same signals.

## Linux host layout and systemd installation

Use one production layout:

| Resource | Path / identity |
| --- | --- |
| Current release | `/opt/educational-institution-management-system/current` |
| Built API | `/opt/educational-institution-management-system/current/apps/api/dist/server.js` |
| Runtime environment | `/etc/educational-institution-management-system/api.env` |
| Repository unit template | `deploy/systemd/educational-institution-api.service` |
| Installed unit | `/etc/systemd/system/educational-institution-api.service` |
| Service user and group | `school-saas` |

The host must provide a compatible Node runtime at `/usr/bin/node`. The successful verification used Node 22; this phase introduces no package or Node-version migration. The published release must include dependencies built/installed for Linux and that Node runtime; do not copy Windows-native dependency binaries. Keep the release root-owned and readable/executable by `school-saas`, including parent-directory traversal and Node dependencies. The service account must not own or write release artifacts. Do not publish checkout `.env` files or deployment credentials inside the release.

Provision the non-login system identity once on a fresh host (check existing identity before rerunning):

```bash
sudo groupadd --system school-saas
sudo useradd --system --gid school-saas --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin school-saas
sudo install -d -o root -g school-saas -m 0750 /opt/educational-institution-management-system
sudo install -d -o root -g root -m 0700 /etc/educational-institution-management-system
```

The operator/pipeline places the validated release at `current` with root ownership and service-group read/traverse access. Supply `api.env` from the approved secret store using the runtime-only allowlist in [ENVIRONMENT.md](ENVIRONMENT.md), then set its owner to root and mode to `0600`. systemd reads the file as root before dropping to the service identity; the account does not need direct access to this file. The environment directory stays root-owned with mode `0700`. Never include migration/admin or provisioning passwords in the service environment.

From the validated release checkout containing the unit template, install and activate it:

```bash
test -x /usr/bin/node
test -f /opt/educational-institution-management-system/current/apps/api/dist/server.js
sudo test -f /etc/educational-institution-management-system/api.env
sudo chown root:root /etc/educational-institution-management-system/api.env
sudo chmod 0600 /etc/educational-institution-management-system/api.env
sudo install -o root -g root -m 0644 deploy/systemd/educational-institution-api.service /etc/systemd/system/educational-institution-api.service
sudo systemctl daemon-reload
sudo systemctl enable educational-institution-api.service
sudo systemctl start educational-institution-api.service
sudo systemctl status educational-institution-api.service --no-pager
```

For routine operations:

```bash
sudo systemctl restart educational-institution-api.service
sudo systemctl stop educational-institution-api.service
sudo journalctl -u educational-institution-api.service --no-pager
```

After every start/restart, require HTTP 200 from both `/api/health` and `/api/ready` through the intended production endpoint before declaring rollout complete. Readiness verifies both restricted database connections; process startup alone is insufficient.

Normal `systemctl stop` sends SIGTERM directly to Node, which gracefully shuts down and exits. An intentional stop stays inactive even with `Restart=on-failure`. A crash/non-zero failure is restarted by systemd after `RestartSec=2s`. Enabling the unit connects it to `multi-user.target`, so it starts after host boot. `TimeoutStopSec=30s` is the supervisor's emergency bound; verified normal shutdown completed well within it. Forced termination after an overlong stop is an operational failure, not normal graceful behavior.

A single-instance systemd restart is not zero downtime: deployment restart can cause a brief interruption. Multiple API instances with coordinated reverse-proxy/load-balancer rollout would be required for zero downtime and are outside this phase.

Runtime proof: [GitHub Actions run 38235612526](https://github.com/jeme1980/educational-institution-management-system/actions/runs/38235612526) passed on Ubuntu 24.04 with real systemd, direct Node MainPID/PPID 1, health/readiness, two graceful SIGTERM stops, closed port, clean-stop inactivity, crash recovery to a new PID, and double stop. The temporary workflow remains on the fork verification branch; it is not production application content. The production template adds the documented non-root host identity and fixed layout; this Windows workstation performs static unit validation, not a production-host installation or boot test.

## Deployment checklist

### Pre-deploy

- Full security regression is green with zero security-critical skips.
- API and Web production builds are green.
- `npm audit --omit=dev` is reviewed and findings are classified.
- Backup completed and restore target is available.
- Migration status, expected migration count, environment values, runtime roles, and release identifier are recorded.

### Deploy

- Run the preparation entrypoint once. It always applies every required installer, including Provider DELETE and final Platform privilege hardening; no optional manual DB step is hidden in the checklist.
- On an existing installation, ensure the Provider deactivate/reactivate API and narrow Platform Metrics function callers are already supported by the released artifact before its corresponding hardening step takes effect. Drain or coordinate traffic when upgrading an older incompatible API.
- Start API with runtime-only credentials, verify health/readiness, publish Web, then validate proxy/TLS behavior.

### Post-deploy smoke test

Check `/`, `/api/health`, `/api/ready`, platform login, school login, a reference lookup, one representative read/write, refresh/logout, and a deep link. Confirm refresh tokens are not present in JSON responses and are delivered as Secure, HttpOnly, SameSite cookies in production.

### Rollback

The school/auth capability cutover has an ACL compatibility checkpoint independent of Prisma migration compatibility. Follow the [pre-revoke/post-revoke rules and decision table](SCHOOL_RUNTIME_CAPABILITIES.md#rollback-acl-compatibility-checkpoint) before selecting a rollback release.

Before `school-runtime-legacy-revoke.sql`, the legacy grants remain and RC3 application rollback is technically possible if there is no other incompatible application/schema change: `PRE_REVOKE_ROLLBACK=APPLICATION_ROLLBACK_POSSIBLE`. This does not roll back migrations.

After revoke, RC3/old direct-table runtime is incompatible with the hardened ACL contract. **Do not roll back application code alone to RC3.** Default recovery is roll forward/redeploy the new auth-capability runtime. `POST_REVOKE_OLD_RUNTIME_ROLLBACK=NOT_SAFE_WITHOUT_EXPLICIT_ACL_RESTORATION`. Any emergency restoration must be explicit, reviewed, authorized and limited to the precise old-runtime privileges, using the captured pre-revoke effective table/column ACL snapshot. There is no automatic blanket GRANT or restoration script.

Immediately before revoke, capture the read-only ACL checkpoint described in the capability runbook. If emergency privileges are restored, POST_CUTOVER must fail by design: the environment is temporarily legacy, not final hardened production. Redeploy the capability runtime, revoke the reviewed obsolete grants again, require POST_CUTOVER success, and repeat runtime smoke checks before accepting hardened operation.

1. Stop or drain writes and record the failing release.
2. Only if both schema and the current ACL checkpoint are compatible with the chosen release, restore that compatible API release at `/opt/educational-institution-management-system/current` and compatible Web artifacts without changing runtime environment values. After legacy revoke, choose a runtime that uses the auth-capability boundary; RC3 code alone is not a compatible recovery. Run `sudo systemctl restart educational-institution-api.service`, then require HTTP 200 from both `/api/health` and `/api/ready` and auth/session/plan smoke success before returning traffic. Health/readiness alone do not prove the old runtime has the required ACLs.
3. Confirm database compatibility before rollback; never assume Prisma has down migrations.
4. If a destructive migration is involved, restore the database backup to a replacement database, provision roles, validate readiness/RLS, and switch traffic only after smoke tests pass.

The default database rollback policy is forward-fix. Destructive changes require a staged rollout and a tested restore path.

Database recovery and restore validation remain governed by [BACKUP_RESTORE.md](BACKUP_RESTORE.md); runtime rollback does not introduce down migrations.

### Canonical API release acceptance

On the isolated PostgreSQL test environment described in [SCHOOL_RUNTIME_CAPABILITIES.md](SCHOOL_RUNTIME_CAPABILITIES.md#canonical-api-release-suite), run `npm run test:api:release` (`npm.cmd run test:api:release` on Windows). This single command builds API and includes the original API baseline and all four boundary tests in one sequential Node test invocation. The current RC4 expectation is 295 total, 293 PASS, 0 FAIL and the two known optional rollover SKIPs when `RUN_ROLLOVER_INTEGRATION` is disabled. Never run it against the real `school` database. Current canonical RLS selection is 7/7; historical 8/8 is documentation drift, not an extra required test.

No Node/npm version pin exists in the repository; this remains separate non-blocking release debt. Review `npm audit --omit=dev` separately. Do not run `npm audit fix` as part of deployment preparation.

## RPO/RTO targets

Recommended initial targets until the operator defines service-specific objectives:

- RPO: 24 hours for the first release; reduce to 1 hour once scheduled backups are operational.
- RTO: 4 hours for a replacement-database restore; measure and tighten after a successful restore drill.

These are operational targets, not application guarantees.
