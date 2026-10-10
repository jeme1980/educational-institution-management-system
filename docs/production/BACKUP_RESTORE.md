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
3. Point deployment-only `MIGRATION_DATABASE_URL` and the two restricted runtime URLs at the restored database. Keep the migration credential out of the API runtime.
4. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-production.ps1` against the isolated restored database. This reapplies roles before and after Prisma migrations, installs Platform Metrics, applies Provider DELETE and final privilege hardening, runs idempotent reference bootstrap, and verifies migration history and final ACL. Prisma receives the migration credential through its child-process `DATABASE_URL` mapping.
5. Confirm the restored release supports Provider deactivate/reactivate and the narrow Platform Metrics functions before applying traffic to it.
6. Do not reset existing platform administrator passwords during bootstrap.
7. Point a test API process at the restored school/platform runtime URLs.
8. Verify `/api/ready` returns 200 and restricted-role checks report both roles as safe.
9. Run representative counts for institutions, users, students, staff, exams, results, subscriptions, and audit logs.
10. Prove school tenant isolation and platform restrictions using the existing security regression suites.
11. Record elapsed restore time, failures, counts, and the resulting RPO/RTO measurement.

## Recovery procedure

1. Disable or drain writes and declare the incident.
2. Identify the latest verified backup and its checksum.
3. Create a replacement database and restore it.
4. Point deployment-only and restricted runtime database URLs at the replacement database, then run `scripts/deploy-production.ps1` from the compatible release. It provisions both roles, checks and deploys migrations, applies every required hardening installer, runs bootstrap, and verifies the final ACL.
5. Keep the migration credential out of the API runtime environment.
6. Start the API against the replacement database and wait for readiness.
7. Run smoke tests and representative security checks.
8. Switch proxy traffic to the validated API/database pair.
9. Resume writes, monitor errors and backups, and document the incident.

## Validation evidence

Do not declare a restore successful from counts alone. The minimum evidence is: readiness 200, school RLS isolation pass, platform restriction pass, representative API read/write pass, cookie/refresh lifecycle pass, and a captured restore duration.
