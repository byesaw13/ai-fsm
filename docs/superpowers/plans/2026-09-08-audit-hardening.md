# Audit Hardening Implementation Plan

Goal: Implement the approved September 8 audit recommendations on isolated branch fix/audit-hardening.
Architecture: Retain Next.js, PostgreSQL, and the worker. Reuse transaction helpers and existing test infrastructure. Preserve additive migration history and existing billing work.
Tech Stack: pnpm, Next.js 15, React 19, PostgreSQL 16, Vitest, Playwright.
Spec: docs/backlog/TASK-132-audit-hardening.md (user approved audit recommendations in chat).

## Global constraints
No production data deletion, no disabling authentication or RLS to pass tests, no edits to applied migrations, no new product features. Keep production deploy separate from local verification and preserve rollback credentials. Do not print secrets.

## Tasks
- [ ] Framework patch: apps/web/package.json and pnpm-lock.yaml; choose latest patched existing-major versions from official advisory and registry; install, run gate:fast and core-flow smoke.
- [ ] Integration gate: .github/workflows/ci.yml, integration configs and test setup; invoke pnpm test:integration with TEST_DATABASE_URL and TEST_BASE_URL after server readiness, fail missing CI prerequisites, repair stale tests against implemented flows.
- [ ] Database isolation: inspect all auth/public/internal/worker database entry points; add least-privilege runtime provisioning with separate migration identity; fix transaction-local context call sites, test cross-account read/write isolation and login/worker behavior with real database. No privilege switch before checks pass.
- [ ] Project loading: apps/web/app/app/jobs/[id]/page.tsx; reuse withDbSession, consolidate repeated assessment lookup and independent reads; preserve role checks and output, measure query/load impact.
- [ ] Redis cleanup: infra/compose.dev.yml, scripts/{bootstrap,dev-stack,gate}.sh and optional environment configuration; delete unused service and references, validate shell and Compose.
- [ ] Review and release: inspect complete diff; run static/unit/integration/e2e, push branch and review CI, deploy validated revisions within approved recommendation, verify runtime version/health/database privileges. Record remaining provider-managed secret rotations accurately.

## Execution ledger
- Baseline: origin/main 0727008, production checkout and runtime verified during audit. Existing user billing edits remain untouched in primary checkout.
- Worktree: /home/nick/ai-fsm-deploy-clean/.superpowers/worktrees/audit-hardening.

- Framework security patch is isolated on fix/task-131-framework (TASK-131) so it can ship first. Remaining cleanup is TASK-132; both backlog drafts are preserved.
- CI missing-prerequisite regression reproduced: 122 tests skipped with exit 0; config now exits 1. CI-mode integration passes 126 web + 21 worker, with only three inverse sentinel skips.
- Restricted-role real DB checks pass: no admin privilege/DDL, bounded login, cross-account read/write denial, transaction context cleared. Production role switch is NOT enabled: public token discovery, internal HA endpoints, global worker polling and remaining raw query paths still require explicit boundaries. No blanket allow policy or bypass role introduced.
- Reviewed migration-credential override hazard fixed for gate/dev/bootstrap. scripts/dev-stack.test.mjs observed failing with ambient admin URL, then passing with forced local URL.
