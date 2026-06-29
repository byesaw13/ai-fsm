# @ai-fsm/mcp

Local, **read-only** Model Context Protocol server for Dovetails OS. Exposes
eight business tools (clients, invoices, estimates, jobs, payments, daily ops)
to MCP clients like Claude Desktop and the Claude CLI.

Read-only by design: every query runs in a `transaction_read_only` transaction,
scoped to a single owner/admin operator and their account (explicit `account_id`
filter + the web app's RLS session vars). No raw SQL, no secrets, no Square or
other write actions.

## Quick start

```bash
pnpm --filter @ai-fsm/mcp build
DATABASE_URL=postgres://... DOVETAILS_MCP_USER_EMAIL=you@example.com \
  node services/mcp/dist/index.js
```

Full setup (Claude Desktop / CLI config, security model, tool reference):
[`docs/working/mcp-server.md`](../../docs/working/mcp-server.md).

## Scripts

| Script | What |
| --- | --- |
| `dev` | Run from TS via tsx |
| `build` | Compile to `dist/` |
| `start` | Run the built server |
| `test` / `test:unit` | Vitest unit tests (no DB) |
| `test:integration` | Vitest integration tests (needs `TEST_DATABASE_URL`; else skipped) |
| `typecheck` | `tsc --noEmit` |
| `lint` | ESLint |

## Layout

```
src/
  index.ts        entrypoint: resolve operator, start stdio server
  server.ts       register tools, wrap each in a read-only session
  session.ts      resolve + authorize the owner/admin operator
  db.ts           pool + withMcpSession (read-only, RLS-scoped)
  money.ts        cents/duration formatting helpers
  types.ts        Session + Executor interfaces (no runtime deps)
  tools/          one file per tool, each with its own Zod input schema
    __tests__/    one unit test per tool + registry contract test
```
