# RLS web-tier flip runbook (TASK-146)

Turns the already-written RLS from documentation into enforcement, by switching
the **web** container from the Postgres **superuser** to the restricted
**`ai_fsm_web`** role. This is the step that actually activates every RLS policy
in migrations `003` and `182`–`185`.

Lands on **main** (it touches `infra/` + `scripts/` that only exist on main after
PR #643). The RLS migrations, the coverage guard, and the sessionless-route
`set_config` fixes rebase in from the `feat/task-120-deposit-gate` branch.

## Model

- **web → `ai_fsm_web`** (`NOBYPASSRLS`, `NOSUPERUSER`). Every request sets
  `app.current_account_id` (via `withDbSession`), so RLS enforces tenant
  isolation at the DB. **This is the security win.**
- **worker → stays privileged** (the current superuser `DATABASE_URL`). The
  worker is a trusted cross-tenant batch processor: no job sets account context
  and most already query `estimates`/`invoices`/`visits` across accounts, so it
  cannot run under a `NOBYPASSRLS` role. It bypasses RLS by design. **No worker
  change in this flip.**
- **migrations → admin** (`MIGRATION_DATABASE_URL`, the superuser). DDL and the
  role provisioner need owner privileges.

## Prerequisites (all already true on main once the branch rebases)

1. **RLS coverage complete.** Migrations `182`–`185` secure every account-scoped
   table; `node scripts/check-rls-coverage.mjs` prints `RLS coverage: ok` with an
   empty allowlist.
2. **Auth bootstrap is RLS-safe** (PR #643, `178_runtime_login_boundary.sql`):
   - session resolve → `apps/web/lib/auth/session.ts` uses
     `queryOneForSession(... WHERE id = $1 AND account_id = $2)` (context-scoped).
   - login by email → `apps/web/app/api/v1/auth/login/route.ts` uses
     `SELECT * FROM app_login_candidates($1)` (a `SECURITY DEFINER` lookup the
     provisioner grants `EXECUTE` on to `ai_fsm_web`).
   - sessionless public writes set context in-transaction:
     `api/booking/route.ts` (`BOOKING_ACCOUNT_ID`) and
     `api/intake/[token]/route.ts` (`invite.account_id`).
3. **Provisioner present** — `scripts/db-provision-runtime.sh` (creates
   `ai_fsm_web` `NOSUPERUSER NOBYPASSRLS`, grants CRUD on `relrowsecurity` tables
   + sequences + `EXECUTE app_login_candidates`).

## ⚠️ Blockers — DO NOT flip until these land (TASK-146)

The auth login path is RLS-safe (prereq 2), but the **client portal** path is
not yet. Enabling the flip before fixing these breaks portal features silently:

1. **Portal read-bootstrap (P1).** `api/v1/portal/request-access` and the portal
   client/estimate/invoice pages read `clients`/`estimates`/`invoices` — RLS-
   protected since `003` — *before* any account context (the account is resolved
   *from* the row). Under `ai_fsm_web` those reads return nothing, so a magic link
   is silently not sent and portal pages 404. Permissive policies on
   `portal_magic_links`/`portal_sessions` do **not** fix reads of other tables.
   **Fix:** add a bounded `SECURITY DEFINER` resolver (mirroring
   `app_login_candidates`) that maps a portal token/email → account, grant
   `EXECUTE` to `ai_fsm_web`, and set context from it before those reads.
2. **Attention-event portal writes (handled in migration 185).** Portal first-open
   calls `emitAttentionEvent` on a raw pooled client pre-context; migration 185's
   `attention_events` INSERT policy is therefore **permissive** so those telemetry
   writes are not silently dropped. Verify this still holds before flipping.
3. **Square webhook account lookup (P1).** `api/webhooks/square` reads
   `integration_settings` by `locationId` with no session and no
   `app.current_account_id`. Under `ai_fsm_web` that SELECT returns no row, the
   handler acks `{ received: true }`, and completed payments stay pending (Square
   stops retrying). **Fix:** a bounded `SECURITY DEFINER` lookup
   `locationId → account_id` (or set context from the resolved account before the
   rest of the handler), then `set_config` in-transaction.
4. **Public estimate respond (P1).** `api/v1/estimates/[id]/respond` updates
   `estimates` from a signed token *before* setting account context. RLS returns
   no row, the handler treats it as idempotent success, and the customer sees
   approve/decline while the estimate stays `sent`. **Fix:** resolve `account_id`
   from the token (or a SECURITY DEFINER helper) and `set_config` before the
   UPDATE.

Until blockers 1, 3, and 4 land, treat the flip as **not ready** even though the
coverage guard is green (the guard checks table RLS, not every app read-path's
context). Audit remaining sessionless/token/internal entry points in the same
pass — booking and intake already `set_config` in-transaction.

## Change 1 — env (`infra/garonhome.env.example` and the live env file)

Keep `DATABASE_URL` as the **superuser** (worker + migrations use it). Add the
restricted URL + password + explicit migration URL:

```diff
 POSTGRES_DB=ai_fsm
 POSTGRES_USER=ai_fsm
 POSTGRES_PASSWORD=change_me
 POSTGRES_HOST=postgres
 POSTGRES_PORT=5432
 DATABASE_URL=postgresql://ai_fsm:change_me@postgres:5432/ai_fsm
+# Admin URL for DDL + provisioning (same superuser as DATABASE_URL).
+MIGRATION_DATABASE_URL=postgresql://ai_fsm:change_me@postgres:5432/ai_fsm
+# Restricted runtime role for the WEB tier (provisioned by db-provision-runtime.sh).
+AI_FSM_WEB_PASSWORD=change_me_too
+WEB_DATABASE_URL=postgresql://ai_fsm_web:change_me_too@postgres:5432/ai_fsm
```

## Change 2 — compose (`infra/compose.garonhome.yml`)

Override **only the web service's** `DATABASE_URL` (values in `environment:`
win over `env_file:`); leave `worker` untouched so it keeps the superuser URL.

```diff
   web:
     ...
     environment:
       NODE_ENV: production
       APP_PORT: "3000"
       TZ: America/New_York
       SECURE_COOKIES: "${SECURE_COOKIES:-true}"
+      # Web runs as the restricted, RLS-enforced role. Overrides env_file's
+      # DATABASE_URL. The worker deliberately keeps the superuser URL from
+      # env_file (trusted cross-tenant processor — see docs/working/rls-web-tier-flip.md).
+      DATABASE_URL: ${WEB_DATABASE_URL:?WEB_DATABASE_URL is required for the RLS web tier}
```

## Change 3 — deploy sequence

Provision the restricted role after migrations, on every deploy (idempotent, and
re-grants any newly-added RLS tables), before (re)starting web:

```bash
# 1. migrate as admin
MIGRATION_DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm db:migrate

# 2. provision / refresh the restricted web role's grants
RUNTIME_DB_ROLE=ai_fsm_web \
MIGRATION_DATABASE_URL="$MIGRATION_DATABASE_URL" \
RUNTIME_DB_PASSWORD="$AI_FSM_WEB_PASSWORD" \
  bash scripts/db-provision-runtime.sh

# 3. start/restart with the new env
COMPOSE_PROJECT_NAME=ai-fsm docker compose -f infra/compose.garonhome.yml up -d
```

`scripts/bootstrap.sh` (dev) can stay on the superuser `DATABASE_URL` — the flip
is a production/garonhome concern. Optionally add step 2 there too, gated on
`AI_FSM_WEB_PASSWORD` being set, to dogfood the restricted role locally.

## Verification (do this before trusting the flip)

1. **RLS denies with no context** (as the restricted role):
   ```bash
   psql "$WEB_DATABASE_URL" -c "SELECT count(*) FROM clients"   # expect 0
   ```
   0 rows = RLS is enforced (superuser would return the real count).
2. **RLS allows with context**:
   ```bash
   psql "$WEB_DATABASE_URL" -c "SET app.current_account_id='<acct-uuid>';
                                SET app.current_role='owner';
                                SELECT count(*) FROM clients"    # expect the real count
   ```
3. **App smoke (as web, restricted role):** log in; load My Day / dashboard;
   open a client + property; create and price an estimate; submit the **public
   booking form**; open a **client portal** link; record a payment. All must work.
4. **Worker unaffected:** `docker compose ... logs -f worker` shows jobs still
   running (it kept the superuser URL).

## Rollback

Point web back at the superuser and restart — instant, no data change:

```diff
-      DATABASE_URL: ${WEB_DATABASE_URL:?...}
+      # DATABASE_URL: (reverted — web back on superuser via env_file)
```
```bash
COMPOSE_PROJECT_NAME=ai-fsm docker compose -f infra/compose.garonhome.yml up -d web
```

## Gate wiring (once on main)

`gate.sh` already runs `node scripts/*.test.mjs` (covers
`check-rls-coverage.test.mjs`). Add the direct check next to the migration-prefix
one so a new un-secured table fails CI:

```diff
 node scripts/check-migration-prefixes.mjs
+node scripts/check-rls-coverage.mjs
 node --test scripts/*.test.mjs
```

## Later: a restricted worker (optional, not required for this flip)

If the worker should also drop the superuser, it needs `BYPASSRLS` (per-account
scoping is infeasible — it can't even enumerate accounts under RLS). That means
relaxing the provisioner's DO-block guard to permit `BYPASSRLS` **for the worker
role only**, keeping `ai_fsm_web` strictly `NOBYPASSRLS`. Out of scope here.
```
