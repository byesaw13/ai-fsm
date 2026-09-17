# TASK-131: Audit hardening — framework security patch

Status:
Done

Phase:
cross-cutting

Problem:
The audit found the deployed framework dependencies predate security fixes.

Business Value:
Protect authenticated customer and business workflows.

Scope:
- Upgrade Next.js and React to patched releases and align framework configuration.
- Validate a clean install, gate:fast, and the core release smoke on a disposable database.

Out of Scope:
- Database role changes, broader audit remediation, deployment, and merging.

Acceptance Criteria:
- [x] Next.js and React use patched versions with a reproducible lockfile.
- [x] Clean-checkout static checks, build, unit tests, and core release smoke pass.

Notes:
Framework-only portion of the September 2026 audit hardening sequence.
Security release: https://nextjs.org/blog/august-2026-security-release

Validated 2026-09-09 with `pnpm gate`: patched build, unit, restricted-role integration, and canonical release smoke passed.
