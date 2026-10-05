# Backup and Restore Runbook

## Backup policy

Use PostgreSQL logical custom-format backups. A practical initial schedule is daily full backups with 30 days of retention, encrypted at rest and in transit, with access limited to the deployment/recovery operators. Increase frequency or add WAL/PITR when the measured RPO requires it.

The backup must include application data, schema, migration metadata, reference data, institutions, users, students, staff, exams, results, subscriptions, audit logs, and required ownership/ACL metadata. Runtime roles are not a substitute for backup and are provisioned separately after restore.

If institution logos or uploaded assets live outside PostgreSQL, include their storage path in the same retention policy. If no such persistent file store exists, record that the database is the complete application data source.

## Safe backup command

Run from a trusted migration host with the password supplied through the environment or an approved PostgreSQL credential mechanism; do not put it in the command line or shell history.

```powershell
$env:PGPASSWORD = $env:BACKUP_DATABASE_PASSWORD
pg_dump --format=custom --file="C:\backups\school-management-$(Get-Date -Format yyyyMMdd-HHmmss).dump" $env:BACKUP_DATABASE_URL
Remove-Item Env:PGPASSWORD
```

On Linux, use an equivalent secret-file or credential-provider mechanism. Verify the dump exists, is non-empty, encrypted by the storage layer, and has a recorded checksum.

## Restore drill

Use an isolated empty test database; never overwrite production during a drill.

1. Create the empty restore database.
2. Restore the custom dump with migration/admin credentials.
3. Run `npm run db:setup-runtime-role` and `npm run db:setup-platform-role` against the restored database.
4. Run `npm run db:migrate:deploy` and confirm the migration status is up to date.
5. Run `npm run db:install-platform-metrics-api --workspace @school-management-system/api` to restore the restricted definer role and its versioned functions.
   Apply `npm run db:install-provider-delete-hardening --workspace @school-management-system/api` after the Provider deactivate/reactivate API is deployed so restored `platform_app` cannot hard-delete Provider rows.
6. Run the explicit production bootstrap only if reference data is absent; it must be idempotent and must not reset existing passwords.
7. Point a test API process at the restored school/platform runtime URLs.
8. Verify `/api/ready` returns 200 and restricted-role checks report both roles as safe.
9. Run representative counts for institutions, users, students, staff, exams, results, subscriptions, and audit logs.
10. Prove school tenant isolation and platform restrictions using the existing security regression suites.
11. Record elapsed restore time, failures, counts, and the resulting RPO/RTO measurement.

## Recovery procedure

1. Disable or drain writes and declare the incident.
2. Identify the latest verified backup and its checksum.
3. Create a replacement database and restore it.
4. Provision `school_app` and `platform_app` with `NOSUPERUSER NOBYPASSRLS`.
5. Run migration status and bootstrap/reference validation.
6. Start the API against the replacement database and wait for readiness.
7. Run smoke tests and representative security checks.
8. Switch proxy traffic to the validated API/database pair.
9. Resume writes, monitor errors and backups, and document the incident.

## Validation evidence

Do not declare a restore successful from counts alone. The minimum evidence is: readiness 200, school RLS isolation pass, platform restriction pass, representative API read/write pass, cookie/refresh lifecycle pass, and a captured restore duration.
