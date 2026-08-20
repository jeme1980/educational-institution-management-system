# RLS Setup for PostgreSQL

## 1) Apply the SQL setup

Run the file as a superuser:

```bash
psql "$DATABASE_URL" -f apps/api/src/db/rls-setup.sql
```

## 2) Set the app connection to the app_user role

Use a separate connection string for the application, for example:

```bash
export DATABASE_URL_APP_USER='postgresql://app_user:change-me-strong-password@localhost:5432/<db-name>'
```

The API already reads `DATABASE_URL_APP_USER` first, then falls back to `DATABASE_URL`.

## 3) Ensure the transaction-local setting is used

Every request should set:

```sql
SET LOCAL app.current_institution_id = 'inst-demo-001';
```

The middleware in the API does this automatically for the current request transaction.

## 4) Keep admin bypass separate

Use `admin_role` only for clearly documented admin-only paths. Do not use it as the default app connection.

## 5) Verify the behavior

Test a normal tenant query and then a cross-tenant query. The cross-tenant query should return zero rows rather than exposing data.
