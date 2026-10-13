# v0.1.0-rc.3

- Release status: Production Release Candidate.
- Proposed tag: `v0.1.0-rc.3`; not created by release preparation.
- Release base before version commit: `c9797893f1bf5ca7e3c9ceaa75176ee276c46a50`.
- Production readiness: PASS, from the final acceptance gate on that base.
- Blockers: NONE in the accepted production readiness gate.
- PRODUCTION DEPLOYED = NO.

## Verified product areas

- Multi-school SaaS tenancy and PostgreSQL RLS isolation.
- Platform Security hardening and restricted runtime permissions.
- Subscription and plan-limit concurrency, including Initial Admin limits.
- Secure Account Setup production delivery and token lifecycle.
- Survey management, multi-round analytics, comparisons, and reports.
- Atomic XLSX import and preview, logical workbook limits, and ZIP/archive expansion protection.
- Prisma schema/migration reconciliation and release test-suite stability.
- Production deployment preparation and Linux + systemd API supervision.

## Verified runtime contract

The official production API runtime is Linux + systemd. The verified baseline is Ubuntu 24.04 LTS. [GitHub Actions run 38235612526](https://github.com/jeme1980/educational-institution-management-system/actions/runs/38235612526) proved direct Node MainPID ownership with PPID=1, health and readiness HTTP 200, real SIGTERM delivery, graceful shutdown, crash restart, clean stop without restart, double stop, and no forced kill during graceful stop.

The production unit and host installation contract are documented in [PRODUCTION_DEPLOYMENT.md](../production/PRODUCTION_DEPLOYMENT.md) and [ENVIRONMENT.md](../production/ENVIRONMENT.md). A single-instance restart can briefly interrupt service; this release does not provide zero-downtime deployment. Windows remains development/operator tooling, not the official production API supervisor.

## Database and acceptance evidence

The final acceptance gate applied 37/37 migrations to an isolated fresh database. DB drift: NONE. Production DB/ACL verification and restricted runtime DB role checks: PASS. Runtime credentials remain separate from migration/deployment credentials.

These are the accepted base's results; release preparation changes version metadata and these notes only:

| Suite / check | Accepted result |
| --- | --- |
| API full | 291 total; 289 PASS; 0 FAIL; 2 intentional rollover SKIP |
| Web full | 339/339 PASS |
| Survey backend | 130/130 PASS |
| Survey frontend | 113/113 PASS |
| Phase10 | 21/21 PASS |
| Platform Security | 4/4 PASS |
| RLS | 8/8 PASS |
| Plan concurrency | 26/26 PASS |
| Initial Admin limits | 15/15 PASS |
| Concurrency + Initial Admin | 41 PASS |
| Account Setup production delivery | PASS |
| API and Web production builds | PASS |
| Prisma validate | PASS; Prisma 6.19.0 |

## Accepted non-blocking debt

- Dashboard CSS budget warning: 12.41 kB versus 10 kB.
- Legacy lint debt.
- Accepted dependency advisories; this release does not claim zero vulnerabilities.
- No strict Node/npm version pin.
- Individual Prisma disconnect success is not separately logged.
- No deterministic in-flight runtime shutdown test harness.
- Visual/UAT was not executed.

Release candidate readiness does not mean production deployment. PRODUCTION DEPLOYED = NO.
