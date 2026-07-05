# TASK-033: Read-Only Business MCP Server

Status:
Done

Phase:
cross-cutting

Problem:
There is no way to ask the Dovetails database natural-language questions ("what's
outstanding?", "summarize the Smith job", "what happened today?") from an AI
client. Pulling this data means opening the app and navigating, or writing SQL.

Business Value:
- Lets the owner query live business state conversationally from Claude Desktop /
  the Claude CLI without building new UI.
- Sits on top of the existing service/database layer instead of creating a
  parallel system, so it inherits account scoping and RLS for free.
- Foundation for later low-risk write tools (see TASK-035) once the read surface
  proves useful in daily use.

Scope:
- New workspace `services/mcp` (`@ai-fsm/mcp`): a local, stdio MCP server.
- Eight read-only tools: `search_clients`, `get_client_summary`,
  `get_invoice_status`, `list_unpaid_invoices`, `list_open_estimates`,
  `get_job_summary`, `get_recent_payments`, `get_daily_operations_log`.
- Owner/admin-only operator identity resolved at startup; tech rejected.
- Account scoping via explicit `account_id` predicate **and** the web app's RLS
  session vars; read-only enforced with `transaction_read_only = on`.
- Structured JSON responses; no raw-SQL tool; no secrets exposed.
- Unit tests per tool (no infra) + integration tests behind `TEST_DATABASE_URL`.
- Setup + security docs: `docs/working/mcp-server.md`.

Out of Scope:
- Any write/mutation tool (deferred to TASK-035).
- Square or other payment-provider actions; Home Assistant actions.
- Claude Desktop wiring/config delivery (documented, not provisioned).

Acceptance Criteria:
- [x] Eight read-only tools return structured JSON.
- [x] Owner/admin can operate; tech rejected before startup.
- [x] Account A never sees account B data (verified end-to-end).
- [x] Writes inside the MCP session fail (read-only transaction, verified).
- [x] Unit tests pass with no DB; integration tests pass against real Postgres.
- [x] Setup + security documented in `docs/working/mcp-server.md`.

Notes:
Archived during north-star reconciliation (2026-07-03). Shipped in
`services/mcp/`.