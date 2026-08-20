# Prisma Migration Report

Prisma is the API's only application ORM and `apps/api/prisma/schema.prisma`
is the canonical database model source.

## Current state

- All API database operations use the Prisma singleton in `apps/api/src/db/prisma.ts`.
- Auth, students, enrollments, study groups, staff, settings, exams,
  questions, results, imports, analytics, seed, and bootstrap paths use Prisma.
- Tenant filtering remains institution-scoped throughout controllers and
  middleware. Cross-institution update/delete paths require both record ID and
  institution ID where applicable.
- Password hashing, token exchange, JWT behavior, role codes, permission codes,
  and API response contracts remain unchanged.
- Exam deletion and result/question score writes use Prisma transactions.
- Stored exam totals and question points are not recalculated or redesigned.
- Complex dashboard grouping is performed after structured Prisma reads; no raw
  SQL was required by the converted runtime paths.

## Database tooling

- Prisma format, validation, client generation, typecheck, and API build pass.
- No database reset or schema-changing database command was run in this
  environment. Existing PostgreSQL compatibility remains independently
  unverified.
- Development seed and admin bootstrap use Prisma.
