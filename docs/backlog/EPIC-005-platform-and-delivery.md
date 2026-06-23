# EPIC-005: Platform & Delivery

How the app is packaged, served, and installed — the delivery surface beneath
the product features. Concerns here are cross-cutting (installability, secure
origin, offline behavior, deployment shape) rather than tied to any one
workflow.

## Active tasks

# TASK-020: PWA Installability

Status:
In Progress

Problem:
The web app cannot be installed as a Progressive Web App on phones or desktops.
There is no web app manifest, no app icons, and no service worker, so the
browser never offers an install prompt. Field use on a phone means living in a
browser tab instead of an installed app.

Business Value:
- An installed, home-screen app for field/phone use (faster launch, full-screen,
  no browser chrome).
- Foundation for later offline/caching work if it proves needed.

Scope:
- Add a valid web app manifest (`app/manifest.ts` metadata route) with name,
  short_name, start_url, `display: standalone`, theme/background colors, and
  icons.
- Add required app icons: 192x192 and 512x512 minimum (plus a maskable variant).
- Ensure the manifest is linked from the app metadata.
- Add a minimal service worker with a fetch handler and register it **only in
  production**.
- Confirm installability via Chrome DevTools / Lighthouse on a secure origin.
- Document the secure-origin requirement for production deployment.

Out of Scope:
- Offline caching / background sync (no real offline requirement yet — keep the
  service worker minimal; do **not** adopt `next-pwa` or a Workbox toolchain
  until a concrete caching/offline need exists).
- Push notifications.
- Solving the production HTTPS origin (tracked separately as a deployment
  blocker; see Notes).

Acceptance Criteria:
- [ ] Browser detects a valid manifest (linked, parses, required fields present).
- [ ] App ships installable icon assets (192 + 512, resolve at their URLs).
- [ ] Service worker is registered in production (and not in dev).
- [ ] Lighthouse PWA / installability checks pass except where blocked by the
      deployment origin.
- [ ] Documentation states that HTTP `.local` is not installable and that a
      secure origin (HTTPS, or `localhost`) is required.

Notes:
**Deployment blocker (separate from app config):** production runs at
`fsm.garonhome.local` over HTTP (`infra/compose.garonhome.yml`: "SSL: None for
.local LAN"). Chromium only offers install on a secure origin — HTTPS or
`localhost`. Even a perfect manifest + service worker will not produce an install
prompt on the current HTTP `.local` origin. Best path: a real domain/subdomain
fronted by the homelab Nginx Proxy Manager with Let's Encrypt; alternative: an
internal CA / trusted cert on the installing devices.

This task delivers the application layer and documents the origin requirement;
the HTTPS origin itself is a deployment task, not a code change. From an
app-config standpoint the criteria are satisfiable now; the final Lighthouse
"installable" green requires the secure origin to be in place.

Deployment runbook for the HTTPS path: `docs/working/pwa-https-deployment.md`.
Chosen route — **Cloudflare Tunnel** to a real subdomain (`app.<domain>`): a
trusted public cert, reachable on cellular for staff and clients with no VPN
client, no inbound host ports, home IP hidden. This serves field staff (who
install the PWA) and clients (who use the portal in a browser) from one origin.
Tailscale was evaluated and rejected: it requires the VPN on every device, so it
cannot serve clients, and `tailscale serve` collided with NPM on host 443.

# TASK-033: Read-Only Business MCP Server

Status:
In Progress

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
Read-only "v1, keep it boring" by design — expose business state to an AI client
before exposing any ability to change it. Integration tests currently run as a
superuser role; non-superuser RLS verification is split into TASK-034.

# TASK-034: MCP Non-Superuser RLS Verification

Status:
Proposed

Problem:
The MCP integration tests (TASK-033) run as a Postgres superuser, which bypasses
RLS. Account isolation is therefore proven only through the tools' explicit
`account_id` predicates, not through RLS policies alone. That is acceptable for
the read-only phase (it matches what production currently relies on), but it
leaves the row-level-security half of the defense-in-depth model unverified.

Business Value:
- Confirms the database enforces tenant isolation even if an application-level
  `account_id` filter is ever dropped from a query by mistake.
- De-risks future write tools (TASK-035), where a scoping bug would be worse.

Scope:
- Add integration coverage that connects as a **non-superuser application role**
  (no `BYPASSRLS`), with the same `app.current_*` session vars the server sets.
- Verify `app_role()` / `app_account_id()` resolve correctly for that role.
- Verify RLS policies **alone** prevent cross-account reads (A cannot see B) with
  the explicit `account_id` predicate deliberately removed in the test query.
- Confirm the MCP surface stays secure under both RLS and app-level filtering.

Out of Scope:
- Changing the production DB role or connection model.
- Any new tools.

Acceptance Criteria:
- [ ] A non-superuser role is provisioned in the integration setup.
- [ ] Cross-account access is blocked by RLS with no explicit `account_id` filter.
- [ ] `app_role()` resolves to the operator's role for that connection.
- [ ] Tests skip gracefully when `TEST_DATABASE_URL` is unset.

Notes:
Tracks the one caveat surfaced when reviewing TASK-033's integration tests.
Originally framed as `MCP-RLS-001`.

# TASK-036: PR Gatekeeper MCP Server

Status:
In Progress

Problem:
Before merging a PR there is no single, repeatable "is this safe to merge?"
check that simulates the merge into the latest `main` and runs the repo's gates
plus Dovetails-specific rules. Reviewers re-derive this by hand each time.

Business Value:
- One command produces a clear merge verdict (yes/no) with blocking issues,
  warnings, the checks that ran, and a suggested next action.
- Catches the recurring footguns: duplicate/destructive migrations, routes
  changed without tests, payment/invoice/Square changes without tests, SQL
  missing `account_id` scoping, and mutating routes missing `withRole`.
- Read-only and side-effect-free against GitHub and the active working tree.

Scope:
- New workspace `services/pr-gatekeeper` (`@ai-fsm/pr-gatekeeper`): a local stdio
  MCP server, TypeScript + MCP SDK.
- Seven tools: `analyze_pr`, `simulate_merge_to_main`, `run_repo_checks`,
  `check_migrations`, `check_changed_api_contracts`,
  `check_dovetails_business_rules`, `generate_merge_report`.
- Merge simulation in a **temporary git worktree** only; always fetch
  `origin/main` first; never mutate the user's active working tree.
- Whitelisted commands only (git / gh / pnpm subcommands); no arbitrary commands
  from PR text; secrets redacted from any captured output.
- Repo checks: `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`,
  `build`.
- Unit tests for every rule check; optional integration test that builds a temp
  git repo and verifies merge-simulation behavior. Docs in
  `docs/working/pr-gatekeeper.md`.

Out of Scope:
- Editing, committing, pushing, or merging anything.
- Writing to GitHub (labels, reviews, statuses) — read-only this phase.
- Auto-fixing findings.

Acceptance Criteria:
- [x] Seven tools return structured JSON; `generate_merge_report` yields a clear
      verdict with blocking issues, warnings, checks run, files changed, and next
      action.
- [x] Merge simulation runs in a temp worktree and leaves the active tree
      untouched (verified by integration test).
- [x] Rule checks (migrations, API contracts, business rules) are pure and unit
      tested.
- [x] Only whitelisted commands run; disallowed commands are rejected.
- [x] Local usage documented in `docs/working/pr-gatekeeper.md`.

Notes:
Read-only, "report don't act" by design — it advises a human, it does not gate
CI or mutate state. A future task could add optional PR-comment output.

# TASK-039: Human-readable numbering for jobs and estimates

Status:
Proposed

Problem:
Invoices have human-readable per-account numbers (`invoices.invoice_number`,
unique per account), but jobs and estimates do not. There is no stable
`J-2026-####` / `EST-2026-####` identifier to reference a job or estimate in
conversation, on paper, or across records.

Business Value:
Every service record can be referenced by a short, human number — the way a
handyman business actually talks about work — and documents/links stay legible.

Scope:
- Add per-account sequential numbers for jobs and estimates, mirroring the
  existing `invoice_number` pattern (additive migration + unique index per
  account, one-time backfill of existing rows).
- Surface the number on job and estimate detail/list pages and on any generated
  documents.

Out of Scope:
- Configurable formats/prefixes (fixed `J-YYYY-####` / `EST-YYYY-####` to start).
- Re-numbering beyond the one-time backfill.

Acceptance Criteria:
- [ ] New jobs receive a unique per-account job number.
- [ ] New estimates receive a unique per-account estimate number.
- [ ] Numbers are shown on the respective detail and list views.
- [ ] Migration is additive and reversible; existing rows are backfilled.

Notes:
Invoice numbering is the reference implementation (`invoices.invoice_number`,
unique index per account). Identified as a genuine gap in the June 2026 recovery
fact-check (`docs/generated/RECOVERY_AUDIT_FACT_CHECK_2026-06.md`), which also
corrected the earlier assumption that invoice numbering was missing — it exists.

## Completed

_None yet._
