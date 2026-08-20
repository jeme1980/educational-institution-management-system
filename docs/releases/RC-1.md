# Release Candidate 1

- Identifier: `v0.1.0-rc.1`
- RC date: 2026-08-20
- Phase 10E: verified
- Baseline scope: final release-candidate audit and freeze only
- Production deployment: not performed

## Verified subsystems

- API and Angular production builds
- TypeScript and Prisma validation
- Prisma migration state: 27 migrations, database up to date
- Authentication, browser session cookies, tenant isolation, RLS, platform boundary, and security regression suites
- Web production server, deep links, static-asset 404 behavior, CSP, HSTS, and security headers
- Spreadsheet import/export hardening
- Local PostgreSQL backup/restore and least-privilege runtime-role verification
- Graceful shutdown and production readiness checks

## Accepted P2/P3 debt

- Angular lint: 56 errors / 138 warnings
- Prisma tooling dependency findings; no High runtime-reachable dependency was identified
- ExcelJS/uuid Moderate dependency debt
- CI/CD is not yet implemented
- Structured logging and selected UX/accessibility improvements remain follow-up work

## Freeze rules

After this baseline, no new features, design overhaul, architecture refactor, billing work, schema/migration changes, broad dependency upgrades, or production deployment are part of the release-candidate freeze.
