# Row-Level Security (RLS) for multi-tenant isolation

## What this adds

This project now includes a database-level defense layer using PostgreSQL Row-Level Security for tenant-scoped tables. The application logic stays intact; the database now rejects cross-tenant reads/writes unless the current tenant context is set.

## How it works

1. Each request resolves an institution ID through the existing request context middleware.
2. The RLS middleware runs `SET LOCAL app.current_institution_id = '<uuid>'` for the current transaction.
3. PostgreSQL policies enforce `institution_id = current_setting('app.current_institution_id', true)::uuid` for tenant tables.

## Applying the migration

Run the SQL file in a PostgreSQL client connected to the target database:

```bash
psql "$DATABASE_URL" -f apps/api/src/db/rls-migration.sql
```

## Adding RLS to a new table

- Add the table to the tenant-scoped list in `apps/api/src/db/tenant-rls.ts`.
- Add the policy statements to `apps/api/src/db/rls-migration.sql`.
- Ensure the table has an `institution_id` column.
- Keep reference/lookup tables without `institution_id` outside this mechanism.

## Seed and admin usage

- Seeds should run with a tenant context set explicitly or use the same middleware flow.
- Administrative bypass paths should remain isolated and should not be the default application connection.
