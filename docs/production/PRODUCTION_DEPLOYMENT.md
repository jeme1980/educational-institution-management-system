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

Build once in a clean checkout with `npm ci`, `npm run build:api`, and `npm run build:web`; deploy the resulting artifacts without rebuilding on the target host.

## Environment contract

Copy the variable names from `.env.example` or `apps/api/.env.example` into the deployment secret store. Never commit or print values. Production requires:

- `NODE_ENV=production`, `AUTH_JWT_SECRET`, token TTLs, `PORT`, `CORS_ORIGINS`, and `APP_URL`.
- `RLS_RUNTIME_DATABASE_URL` for `school_app`.
- `PLATFORM_DATABASE_URL` for `platform_app`.
- `MIGRATION_DATABASE_URL` for migrations/bootstrap only.
- `ACCOUNT_SETUP_URL_BASE` when setup links are enabled.
- `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` only during the explicit bootstrap operation; remove or rotate them immediately afterward.

`school_app` and `platform_app` must be `NOSUPERUSER`, `NOBYPASSRLS`, and must not inherit another role. The API must never use the migration/admin URL at runtime.

## Fresh deployment order

1. Create an empty PostgreSQL database and configure the migration/admin secret.
2. Run `npm ci` and `npm run build:api` / `npm run build:web` in the build environment.
3. Run `npm run db:migrate:deploy` with `MIGRATION_DATABASE_URL`.
4. Provision the school role with `npm run db:setup-runtime-role --workspace @school-management-system/api`.
5. Provision the platform role with `npm run db:setup-platform-role --workspace @school-management-system/api`.
6. Run `npm run db:bootstrap` once with migration credentials. This creates reference data and an optional platform administrator; it does not create demo schools or reset passwords.
7. Configure runtime URLs and start the API with `npm run start:api`.
8. Confirm `GET /api/ready` is HTTP 200 before sending traffic.
9. Publish `apps/web/dist/app/browser` and validate the SPA deep-link fallback.

Do not use `migrate dev`, `db push`, `migrate reset`, or `db:seed:dev` in production.

The role scripts use `psql` when available. On hosts where it is not on `PATH`, set `PSQL_PATH` to the approved PostgreSQL client binary before provisioning. Existing role passwords are preserved by default; use `-RotatePassword` only as an explicit credential-rotation operation.

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

- Deploy immutable API/Web artifacts.
- Run `npm run db:migrate:deploy`.
- Provision runtime roles only when grants changed.
- Run bootstrap only when required.
- Start API, verify readiness, publish Web, then validate proxy/TLS behavior.

### Post-deploy smoke test

Check `/`, `/api/health`, `/api/ready`, platform login, school login, a reference lookup, one representative read/write, refresh/logout, and a deep link. Confirm refresh tokens are not present in JSON responses and are delivered as Secure, HttpOnly, SameSite cookies in production.

### Rollback

1. Stop or drain writes and record the failing release.
2. Restore the previous API and Web artifacts without changing environment values.
3. Confirm database compatibility before rollback; never assume Prisma has down migrations.
4. If a destructive migration is involved, restore the database backup to a replacement database, provision roles, validate readiness/RLS, and switch traffic only after smoke tests pass.

The default database rollback policy is forward-fix. Destructive changes require a staged rollout and a tested restore path.

## RPO/RTO targets

Recommended initial targets until the operator defines service-specific objectives:

- RPO: 24 hours for the first release; reduce to 1 hour once scheduled backups are operational.
- RTO: 4 hours for a replacement-database restore; measure and tighten after a successful restore drill.

These are operational targets, not application guarantees.
