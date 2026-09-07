# Operational invariants (read before auditing, building infra, or deploying)

Agent-facing working knowledge that is **not** in the canonical docs and is
painful to re-derive. These are operational facts, not product/domain rules
(those stay in `docs/canonical/`). TASK-123.

## Deploy lag — check `origin/main` AND `/opt`, never the local checkout
Production runs on **garonhome** via `infra/compose.garonhome.yml`. The prod
checkout at `/opt/business/ai-fsm/repo` and the running container can lag
`origin/main` by many PRs. The local dev checkout here is usually an **old
feature branch**. Before answering "what's built / what's live", check both:
- `git fetch origin main && git log origin/main -1` (what's merged)
- `ssh garonhome 'cd /opt/business/ai-fsm/repo && git log -1'` (what's deployed)

Trusting the local checkout mis-reported feature status **twice**. Always branch
new work off `origin/main`, not the local HEAD.

## Deploy
`bash scripts/deploy.sh` → ssh garonhome → reset `/opt` to `origin/main` → run
SQL migrations (idempotent, tracked in `schema_migrations`) → rebuild web+worker
→ wait for `/api/health`. Deploying is prod and gated; do it only on explicit
say-so. After merging, the phone/PWA (`app.mydovetails.com`) does not change
until this runs.

## Two runtimes, asymmetric egress
The **worker** container is on the `internal: true` network and has **no
internet egress**. Anything calling an external service — Web Push (FCM/Apple),
Anthropic, webhooks — **must run on the web tier**. `lib/push/send.ts` sends on
its own pooled connection; do not route external sends through the
worker-drained `notification_queue`. Email works from the worker only because it
targets a LAN SMTP relay.

## DB role is a superuser → RLS is bypassed today
The app DB role (`ai_fsm`) is `rolsuper`+`rolbypassrls` in dev and garonhome
prod, so RLS is effectively off. Code still sets
`app.current_account_id/user_id/role` defensively (`withDbSession`, the location
ingest route, `lib/push/send.ts`) and **every query still scopes by
`account_id`** — keep both. Don't assume RLS is enforcing isolation.

## garonhome also runs Home Assistant
Scheduled interrupts (RAM start-day, home-arrival + 8 PM day-review) are **HA
rest_commands** hitting `/api/internal/*`, not the worker (no egress). HA config:
`~/docker/homeassistant/{automations,rest_commands}.yaml`; apply via a
homeassistant container restart.

## Migrations: numbers collide, applied files are immutable
`db/migrations/NNN_*.sql` use sequential integer prefixes that **collide across
branches** (175 shipped twice). Applied filenames are **immutable** — renaming
one makes the deploy treat it as new and re-run it, hitting its unconditional
`CREATE TRIGGER` and failing. Claim the next number at **merge** time from the
highest existing; never renumber an applied migration. CI (`scripts/check-migration-prefixes.mjs`,
TASK-128) fails a PR that adds a new file onto an existing prefix; the current
collisions are grandfathered by exact filename.

## Backlog gating + merge gates
New work needs a `docs/backlog/` task first, citing a ROADMAP phase (0–4 or
`cross-cutting`; see the Phase→Epic map in `docs/canonical/ROADMAP.md`). Add its
row to `docs/backlog/README.md` and advance "Next available ID". Merging to main
requires conversation-resolution + resolved Codex threads (`mergeStateStatus`
CLEAN/UNSTABLE). After a merge, a stale PR branch goes `BEHIND` — update it, don't
force.

## Tests + running them locally
- **unit** — no infra: `pnpm test:unit`.
- **integration** (Tier 3, `*.integration.test.ts`) — direct-DB suites need
  `TEST_DATABASE_URL`; HTTP suites also need a running server + `TEST_BASE_URL`
  (they `skipIf` absent). Bring the stack up + run them with
  `bash scripts/dev-stack.sh integration` (see that script).
- **e2e** — Playwright; runs in CI (`e2e-smoke`).
