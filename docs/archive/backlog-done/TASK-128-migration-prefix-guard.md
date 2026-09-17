# TASK-128: CI guard against new duplicate migration numbers

Status:
Done

Phase:
cross-cutting

Problem:
Part B Tier 4 of the 2026-09-05 plan. Migration prefixes already collide
(100, 137, 141, 142, 153, 162, 175). Agents keep minting a second `NNN_*.sql`
on a live prefix; applied files cannot be renamed.

Business Value:
A PR that would collide is rejected in CI instead of failing deploy with a
re-run `CREATE TRIGGER`.

Scope:
- `scripts/check-migration-prefixes.mjs` — unique prefix for new files;
  grandfather today's collisions by exact filename.
- Run from the `lint` job and `scripts/gate.sh`. Do not add a sixth required
  check. Do not renumber applied files.

Out of Scope:
- Timestamp prefixes. Non-superuser DB role (Tier 5). Splitting god-files (Tier 3).

Acceptance Criteria:
- [x] CI fails when a new migration reuses an existing prefix.
- [x] Existing duplicate prefixes still pass.

Notes:
Part B / Tier 4. Completes the leftover called out in TASK-123.

