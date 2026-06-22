# Dovetails OS MCP Server (local, read-only)

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes **read-only** Dovetails OS business data to MCP clients (Claude Desktop,
the Claude CLI, etc.). It lets the operator ask natural-language questions —
"what's outstanding?", "summarize the Smith job", "what happened today?" —
against the live database without writing SQL.

- **Package:** `services/mcp` (`@ai-fsm/mcp`)
- **Transport:** stdio (the client launches the process)
- **Scope:** v1 is read-only. No writes, no Square actions, no secrets exposed.

## Security model

The server is deliberately narrow:

1. **Read-only at the database.** Every tool call runs inside a transaction
   that issues `SET LOCAL transaction_read_only = on`. Postgres rejects any
   write outright — a defense-in-depth backstop on top of the fact that no tool
   issues a mutating statement.
2. **Owner/admin only.** The server runs as a single operator identity resolved
   at startup (`DOVETAILS_MCP_USER_EMAIL` or `DOVETAILS_MCP_USER_ID`). If that
   user's role is not `owner` or `admin`, the server refuses to start. A `tech`
   identity is rejected.
3. **Account scoped.** Every query filters on `account_id = <operator account>`
   explicitly **and** sets the same `app.current_*` RLS session variables the
   web app uses (`apps/web/lib/db.ts`), so row-level security applies identically.
4. **No raw SQL surface.** Tools accept structured, Zod-validated parameters
   only. There is no "run this query" tool.
5. **No secrets.** Tools never select credentials, tokens, or `password_hash`,
   and never read environment secrets back to the client.

## Tools (v1)

| Tool | Purpose |
| --- | --- |
| `search_clients` | Find clients by name/email/phone fragment. |
| `get_client_summary` | 360 snapshot: contacts, properties, jobs by status, open estimate value, outstanding balance, lifetime payments. |
| `get_invoice_status` | One invoice by number or id: status, total, paid, balance. |
| `list_unpaid_invoices` | Invoices with a balance (sent/partial/overdue), days overdue, total outstanding. |
| `list_open_estimates` | Estimates still in draft/sent, with combined pipeline value. |
| `get_job_summary` | One job: details, client, property, visits, estimates, invoice totals. |
| `get_recent_payments` | Completed payments across all channels, newest first. |
| `get_daily_operations_log` | A day's activity ledger (minutes by category), visits, and payments received. |

All responses are structured JSON. Monetary values always carry both raw
`cents` and a formatted display string.

## Configuration

| Env var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Same Postgres the web app uses. |
| `DOVETAILS_MCP_USER_EMAIL` | one of these | Operator email (owner/admin). Preferred. |
| `DOVETAILS_MCP_USER_ID` | one of these | Operator user UUID, as an alternative to email. |
| `LOG_LEVEL` | no | `debug`/`info`/`warn`/`error` (default `info`). Logs go to **stderr**. |

> The server logs only to stderr; stdout is reserved for the MCP JSON-RPC stream.

## Run locally

```bash
# from the repo root
pnpm --filter @ai-fsm/mcp build

# dev (ts, no build step)
DATABASE_URL=postgres://... DOVETAILS_MCP_USER_EMAIL=you@example.com \
  pnpm --filter @ai-fsm/mcp dev
```

A successful start prints two stderr lines (`operator resolved`,
`dovetails-os MCP server ready (read-only)`) and then waits for the client on
stdio.

## Claude Desktop setup

Edit Claude Desktop's config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add a server entry. Use absolute paths; Claude Desktop launches the process
directly, so build first (`pnpm --filter @ai-fsm/mcp build`):

```json
{
  "mcpServers": {
    "dovetails-os": {
      "command": "node",
      "args": ["/absolute/path/to/ai-fsm-deploy-clean/services/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgres://user:pass@host:5432/ai_fsm",
        "DOVETAILS_MCP_USER_EMAIL": "you@example.com"
      }
    }
  }
}
```

Restart Claude Desktop. The eight tools appear under the tools (plug) icon. Try:

> "List unpaid invoices and total what's outstanding."

## Claude Code / CLI setup

```bash
claude mcp add dovetails-os \
  --env DATABASE_URL=postgres://user:pass@host:5432/ai_fsm \
  --env DOVETAILS_MCP_USER_EMAIL=you@example.com \
  -- node /absolute/path/to/services/mcp/dist/index.js
```

## Tests

### Unit (no DB)

```bash
pnpm --filter @ai-fsm/mcp test       # unit tests (no DB required)
pnpm --filter @ai-fsm/mcp typecheck
pnpm --filter @ai-fsm/mcp lint
```

Each tool has a unit test that drives its `run()` against an in-memory executor
(`src/tools/__tests__/helpers.ts`) — asserting output shape, money formatting,
account scoping, and input validation without touching infrastructure.

### Integration (real Postgres)

`src/__tests__/mcp.integration.test.ts` runs against a live database with
migrations + seed applied. It is **skipped unless `TEST_DATABASE_URL` is set**,
so it never blocks the unit suite or a DB-less checkout. It verifies, end to end:

- `withMcpSession` sets `app.current_account_id`, `app.current_user_id`, and
  `app.current_role` (the role variable consumed by the `app_role()` RLS helper).
- Owner and admin operators resolve and can run read-only tools; a **tech** user
  is rejected by `resolveSession` (the startup gate); unknown users are rejected.
- **Account scoping**: with seeded data in two accounts, tools run as account A
  never return account B's clients, invoices, or payments (and vice-versa);
  cross-account lookups by invoice number / client id raise "not found".
- **Read-only enforcement**: an `INSERT`/`UPDATE` issued inside the MCP session
  fails with `cannot execute … in a read-only transaction`, and no row is written.

The suite seeds its own rows (uniquely named) and cleans them up in `afterAll`;
it reuses the standard seed accounts/users from `db/migrations/002_seed_dev.sql`
(Account A `1111…`, Account B `2222…`).

Run it against a throwaway Postgres:

```bash
# 1. start an ephemeral DB
docker run -d --name mcp-it-pg \
  -e POSTGRES_DB=ai_fsm_test -e POSTGRES_USER=ai_fsm_test -e POSTGRES_PASSWORD=pw \
  -p 15433:5432 postgres:16

export TEST_DATABASE_URL="postgresql://ai_fsm_test:pw@localhost:15433/ai_fsm_test"

# 2. apply schema + seed
DATABASE_URL="$TEST_DATABASE_URL" bash scripts/db-migrate.sh
DATABASE_URL="$TEST_DATABASE_URL" bash scripts/db-seed.sh

# 3. run the integration suite
pnpm --filter @ai-fsm/mcp test:integration

# 4. tear down
docker rm -f mcp-it-pg
```

In CI, the Postgres service container already exports `TEST_DATABASE_URL`, so the
suite runs automatically as part of `pnpm test:integration`.

## Not in v1 (intentionally deferred)

- Any write/mutation tool (creating clients, recording payments, sending docs).
- Square (or any provider) write actions, links, or checkout creation.
- Exposing secrets, tokens, or raw SQL.

Adding write tools later must reuse the web app's service layer and audit
logging, and should gate each mutation behind an explicit per-tool capability.

Tracked follow-ups in the backlog:

- **TASK-034** — verify account isolation under a non-superuser RLS role (the
  integration tests here run as a superuser, so isolation is currently proven
  via explicit `account_id` predicates, not RLS policies alone).
- **TASK-035** — first low-risk write tools (`create_job_note`,
  `log_activity_entry`, `log_mileage`, `start_day`, `end_day`) with confirmation
  flags, audit entries, and idempotency. Do not start until this read-only
  server has been in real daily use.
