# Production Environment Matrix

Values belong in the deployment secret store, never in source control or logs.

| Variable | Classification | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Required runtime | Must be `production`. |
| `AUTH_JWT_SECRET` | Required runtime secret | Signs local access tokens; use a long random value. |
| `RLS_RUNTIME_DATABASE_URL` | Required runtime secret | School connection using `school_app`. |
| `AUTH_RUNTIME_DATABASE_URL` | Required runtime secret | Dedicated capability-only school_auth_app connection. |
| `AUTH_RUNTIME_DB_PASSWORD` | Provisioning secret | Never pass to runtime supervisor. |
| `PLATFORM_DATABASE_URL` | Required runtime secret | Platform connection using `platform_app`. |
| `MIGRATION_DATABASE_URL` | Required deployment secret | Prisma migration commands, role provisioning, installers, bootstrap, and final DB verification only. The migration wrapper temporarily maps it to Prisma's `DATABASE_URL` in its child process. |
| `DATABASE_URL` | Not required in production runtime | Prisma schema datasource name. The migration wrapper supplies it transiently; do not inject the migration credential into the API service. |
| `CORS_ORIGINS` | Required runtime | Comma-separated HTTPS browser origins. |
| `APP_URL` | Required runtime | Canonical application URL. |
| `ACCOUNT_SETUP_URL_BASE` | Required runtime and deployment preflight | Public HTTPS account-setup page ending in `/account/setup`; no localhost address, credentials, fragment, or prefilled token. Example: `https://school.example.com/account/setup`. |
| `ACCESS_TOKEN_TTL` | Required runtime | Short access-token lifetime, e.g. `15m`. |
| `REFRESH_TOKEN_TTL_DAYS` | Required runtime | Refresh session lifetime. |
| `PORT` | Required runtime | API listen port. |
| `WEB_PORT` | Required deployment | SPA server listen port. |
| `WEB_API_ORIGINS` | Required deployment | HTTPS API origins allowed by the SPA CSP. |
| `PLATFORM_ADMIN_EMAIL` | Bootstrap only | Initial platform administrator email. Remove after bootstrap. |
| `PLATFORM_ADMIN_PASSWORD` | Bootstrap only secret | Initial platform administrator password. Rotate/remove after bootstrap. |
| `RLS_RUNTIME_DB_ROLE` | Role provisioning | Expected school role name, normally `school_app`. |
| `RLS_RUNTIME_DB_PASSWORD` | Role provisioning secret | Password supplied to the role provisioning script. |
| `PLATFORM_RUNTIME_DB_ROLE` | Role provisioning | Expected platform role name, normally `platform_app`. |
| `PLATFORM_RUNTIME_DB_PASSWORD` | Role provisioning secret | Password supplied to the role provisioning script. |
| `DEV_SEED_ADMIN_EMAIL` / `DEV_SEED_ADMIN_PASSWORD` | Development only | Must not be configured or used in production. |
| `TEST_ADMIN_DATABASE_URL` | Test only | Fixture setup client; never import into production runtime. |

The legacy `DATABASE_URL_UNPOOLED` variable is intentionally absent from the examples because this repository does not use it for runtime or deployment. If a provider supplies an equivalent direct URL, map it to `MIGRATION_DATABASE_URL` in the secret store without committing the value.

Use `.env.example` as the canonical production variable list; `apps/api/.env.example` mirrors the required API and deployment values. Inject deployment secrets only into the deployment helper. Inject only `NODE_ENV`, `PORT`, `APP_URL`, `CORS_ORIGINS`, `AUTH_JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `ACCOUNT_SETUP_URL_BASE`, `RLS_RUNTIME_DATABASE_URL`, `AUTH_RUNTIME_DATABASE_URL`, and `PLATFORM_DATABASE_URL` into the API supervisor. The Web server uses `NODE_ENV`, `WEB_PORT`, and `WEB_API_ORIGINS`. Keep `MIGRATION_DATABASE_URL` and provisioning passwords out of both runtime processes.

## Linux systemd runtime environment file

The official production API supervisor is Linux + systemd (verified baseline: Ubuntu 24.04 LTS). `educational-institution-api.service` reads `/etc/educational-institution-management-system/api.env`, outside the repository and application release. Use systemd environment-file syntax: one `NAME=value` per line, without shell `export`, command substitution, or shell expansion. Include only the API runtime allowlist above; `NODE_ENV=production` is also set in the unit.

Keep the directory root-owned with mode `0700` and `api.env` root-owned with mode `0600`. Populate it through the deployment secret store, never source control or logs. systemd reads it before switching to the non-root `school-saas` user/group. The account therefore does not need ownership or direct read access to the secret file.

Prohibit `MIGRATION_DATABASE_URL`, `DATABASE_URL`, `RLS_RUNTIME_DB_PASSWORD`, `PLATFORM_RUNTIME_DB_PASSWORD`, `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, test/admin DB credentials, and other deployment/backup secrets from this runtime file and service environment. The two restricted runtime connection URLs retain their own required passwords; deployment/admin passwords must never be substituted for them. Windows/PowerShell deployment tooling uses its separate deployment environment and does not supervise the long-lived API process. See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for release paths and systemd installation/operations.

## Database role policy

| Connection | Role | Privilege model |
| --- | --- | --- |
| School runtime | `RLS_RUNTIME_DATABASE_URL` → `school_app` | `NOSUPERUSER`, `NOBYPASSRLS`, tenant CRUD, reference read-only. |
| Authentication runtime | `AUTH_RUNTIME_DATABASE_URL` -> `school_auth_app` | LOGIN, NOINHERIT, no table CRUD; auth_api EXECUTE only. |
| Platform runtime | `PLATFORM_DATABASE_URL` → `platform_app` | `NOSUPERUSER`, `NOBYPASSRLS`, platform workflow grants, no school runtime bypass. |
| Migration/admin | `MIGRATION_DATABASE_URL` | Deployment-only owner/migration privileges; never injected into API runtime. |
