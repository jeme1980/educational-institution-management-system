# Production Deployment Runbook

## Scope and topology

The supported topology is:

```text
Browser -- HTTPS --> reverse proxy --> Web SPA
                              \--> /api --> API --> PostgreSQL
```

The reverse proxy terminates TLS, redirects HTTP to HTTPS, serves the SPA artifact, forwards `/api` to the API process, preserves the original host/protocol headers, and applies a request body limit of at least 10 MB for the spreadsheet import route.

Artifacts and working directories:

| Component | Artifact | Start method |
| --- | --- | --- |
| Web | `apps/web/dist/app/browser` | `npm run start:web` |
| API | `apps/api/dist` | `npm run start:api` |

Run the single preparation entrypoint from a trusted release checkout on Windows PowerShell. It performs `npm ci --include=dev` (build tools are development dependencies), builds both artifacts, upgrades and verifies the database, and stops on the first failure. Publish the resulting immutable artifacts to the API/Web hosts; the process supervisor starts them with runtime-only credentials.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-production.ps1
```

## Environment contract

Copy the variable names from `.env.example` into the deployment secret store. Never commit or print values. Production requires:

- `NODE_ENV=production`, `AUTH_JWT_SECRET`, token TTLs, `PORT`, `CORS_ORIGINS`, and `APP_URL`.
- `RLS_RUNTIME_DATABASE_URL` for `school_app`.
- `PLATFORM_DATABASE_URL` for `platform_app`.
- `MIGRATION_DATABASE_URL` for migrations/bootstrap only.
- `ACCOUNT_SETUP_URL_BASE` as a public HTTPS `/account/setup` page, without a token or localhost address.
- `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` only during the explicit bootstrap operation; remove or rotate them immediately afterward.

`school_app` and `platform_app` must be `NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT`, and must have no role memberships. Prisma's schema names `DATABASE_URL`; `apps/api/scripts/run-prisma-migration.ps1` maps `MIGRATION_DATABASE_URL` to it only within the Prisma child process for validate/status/deploy. The API supervisor must not receive `MIGRATION_DATABASE_URL` or a migration-valued `DATABASE_URL`. Its school and platform connections remain `RLS_RUNTIME_DATABASE_URL` and `PLATFORM_DATABASE_URL`.

## Fresh deployment order

1. Create an empty PostgreSQL database and configure deployment and restricted runtime secrets in the secret store. Take and verify a backup before upgrading an existing database.
2. Run `scripts/deploy-production.ps1`. Its preflight validates all required variables and the HTTPS account-setup URL before changing the database. `-ValidateOnly` runs this check without install, build, or DB writes.
3. The helper runs `npm ci --include=dev`, builds API and Web artifacts, then provisions `school_app` and `platform_app` before migration because migrations grant those roles privileges.
4. It runs Prisma validate and migrate status through `run-prisma-migration.ps1`; a fresh database's *unapplied migrations* status is accepted. It then runs `prisma migrate deploy` with the migration credential and requires post-migration status success.
5. It repeats both role-provisioning commands because new migration tables need their grants and policies.
6. It installs Platform Metrics (`db:install-platform-metrics-api`), then Provider DELETE hardening (`db:install-provider-delete-hardening`), then final Platform privilege hardening (`db:install-platform-final-privilege-hardening`). These are mandatory on both fresh and upgrade runs. The deployment credential needs the role-management rights required by the Metrics installer.
7. It runs idempotent production reference bootstrap and `scripts/verify-production-db.cjs`, which checks migration history, restricted role attributes/memberships, Provider DELETE denial, seven direct SELECT denials, and Metrics execute privileges. Do not start the new API if any step fails.
8. Publish `apps/api/dist` and start the built API under a process supervisor with runtime-only secrets using `npm run start:api`. This command has no port cleanup or migrations. On an occupied port, the new process fails; the supervisor handles rollout without terminating the old process implicitly.
9. Check `GET /api/health` and `GET /api/ready` for HTTP 200 before routing traffic to the new API. Readiness checks both restricted database clients.
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
- Run the API under a service/container/process manager configured for restart-on-failure, boot startup, environment injection, stdout/stderr capture, and graceful SIGTERM handling.
- The API closes its HTTP listener and disconnects both Prisma clients on SIGTERM/SIGINT. The SPA server closes its listener on the same signals.

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

1. Stop or drain writes and record the failing release.
2. If the database migration is backward-compatible, restore the previous compatible API and Web artifacts without changing runtime environment values.
3. Confirm database compatibility before rollback; never assume Prisma has down migrations.
4. If a destructive migration is involved, restore the database backup to a replacement database, provision roles, validate readiness/RLS, and switch traffic only after smoke tests pass.

The default database rollback policy is forward-fix. Destructive changes require a staged rollout and a tested restore path.

No Node/npm version pin exists in the repository; this remains separate non-blocking release debt. Review `npm audit --omit=dev` separately. Do not run `npm audit fix` as part of deployment preparation.

## RPO/RTO targets

Recommended initial targets until the operator defines service-specific objectives:

- RPO: 24 hours for the first release; reduce to 1 hour once scheduled backups are operational.
- RTO: 4 hours for a replacement-database restore; measure and tighten after a successful restore drill.

These are operational targets, not application guarantees.
