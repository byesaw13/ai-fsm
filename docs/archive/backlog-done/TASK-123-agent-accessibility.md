# TASK-123: Agent accessibility — invariants doc + one-command dev/test stack

Status:
Done

Phase:
cross-cutting

Problem:
Part B of the simplification plan. Operational facts an agent needs (deploy lag,
worker-no-egress, superuser/RLS, migration numbering, HA-driven schedules) live
only in people's heads and got re-derived painfully — the deploy lag mis-reported
feature status twice. And the Tier-3 integration stack (compose.dev up → migrate
→ seed → run) was hand-assembled every time.

Business Value:
An agent (or teammate) orients from the repo instead of trial-and-error, and runs
the real (non-mocked) test tier in one command. Lower rediscovery tax, fewer
stale-checkout mistakes.

Scope:
- `ai/INVARIANTS.md` — the operational invariants, linked from `ai/README.md` and
  `AGENTS.md` "Read This First".
- `scripts/dev-stack.sh` — `up | integration | down | reset` over
  `infra/compose.dev.yml`, reusing `db-migrate.sh` / `db-seed.sh`.

Out of Scope:
- Tier 3 (split oversized files), Tier 4 (migration-number CI check), Tier 5
  (non-superuser DB role) — separate future tasks.

Acceptance Criteria:
- [x] `ai/INVARIANTS.md` exists and is linked from AGENTS.md + ai/README.md.
- [x] `bash scripts/dev-stack.sh up` brings the DB up, migrated + seeded; `down`
      tears it down.

Notes:
Part B / Tier 1+2 of the 2026-09-05 plan. Docs + dev tooling only; no app code.
Shipped #632 (incl. the Codex P1 fix: dev-stack.sh targets the local loopback DB
only, never an ambient DATABASE_URL).
