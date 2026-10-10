# Production Environment Matrix

Values belong in the deployment secret store, never in source control or logs.

| Variable | Classification | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Required runtime | Must be `production`. |
| `AUTH_JWT_SECRET` | Required runtime secret | Signs local access tokens; use a long random value. |
| `RLS_RUNTIME_DATABASE_URL` | Required runtime secret | School connection using `school_app`. |
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

Use `.env.example` as the canonical production variable list; `apps/api/.env.example` mirrors the required API and deployment values. Inject deployment secrets only into the deployment helper. Inject only `NODE_ENV`, `PORT`, `APP_URL`, `CORS_ORIGINS`, `AUTH_JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `ACCOUNT_SETUP_URL_BASE`, `RLS_RUNTIME_DATABASE_URL`, and `PLATFORM_DATABASE_URL` into the API supervisor. The Web server uses `NODE_ENV`, `WEB_PORT`, and `WEB_API_ORIGINS`. Keep `MIGRATION_DATABASE_URL` and provisioning passwords out of both runtime processes.

## Database role policy

| Connection | Role | Privilege model |
| --- | --- | --- |
| School runtime | `RLS_RUNTIME_DATABASE_URL` → `school_app` | `NOSUPERUSER`, `NOBYPASSRLS`, tenant CRUD, reference read-only. |
| Platform runtime | `PLATFORM_DATABASE_URL` → `platform_app` | `NOSUPERUSER`, `NOBYPASSRLS`, platform workflow grants, no school runtime bypass. |
| Migration/admin | `MIGRATION_DATABASE_URL` | Deployment-only owner/migration privileges; never injected into API runtime. |
