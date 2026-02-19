# Decision Log (ADR Lite)

Append-only log of technical decisions made by AI agents.

## Entry Template

### ADR-<number>: <short title>
- Date (UTC):
- Agent:
- Task ID:
- Context:
- Decision:
- Alternatives considered:
- Consequences:
- Rollback plan:

---

### ADR-001: Monorepo with Next.js + PostgreSQL + Worker baseline
- Date (UTC): 2026-02-16
- Agent: codex
- Task ID: scaffold-init
- Context: Need low-cost MVP with Pi4 target and minimal ops complexity.
- Decision: Use TypeScript monorepo with Next.js web app, PostgreSQL, Redis, and Node worker.
- Alternatives considered: split repos; Python API + separate frontend; managed BaaS.
- Consequences: simple local dev and deployment flow, but requires custom auth/data-layer implementation.
- Rollback plan: pivot to split services after phase 1 if monorepo causes scale bottlenecks.

### ADR-002: Domain model frozen with properties table and money-in-cents
- Date (UTC): 2026-02-16
- Agent: agent-orchestrator (Claude Code)
- Task ID: P0-T1
- Context: Need to freeze the canonical data model before P1 implementation begins. Source repos use different patterns: Dovelite has `homes` table, Myprogram has `properties`. Myprogram stores money as integer cents; Dovelite uses decimal `price_per_visit`.
- Decision: Adopt Myprogram's entity structure (properties, estimate/invoice line items, audit_log) and money-in-cents pattern. Use `users.role` column (not a separate memberships junction table) for MVP simplicity. Add `cancelled` to job status (present in visit but was missing from job).
- Alternatives considered: (1) Myprogram's memberships junction for user-account-role — rejected for MVP as overkill for single-account use case; (2) Dovelite's `homes` naming — rejected in favor of industry-standard `properties`.
- Consequences: Simpler user model but will need migration if multi-account per user is needed later. Cents-based money avoids floating point issues.
- Rollback plan: Add memberships junction table in P4 if multi-account requirement emerges.

### ADR-003: API versioned under /api/v1 with typed error model
- Date (UTC): 2026-02-16
- Agent: agent-orchestrator (Claude Code)
- Task ID: P0-T2
- Context: Need to freeze API contract. Neither source repo uses versioned APIs. Myprogram uses edge functions with `{ error: string }` responses. Dovelite uses Next.js API routes with ad-hoc error handling.
- Decision: Version all routes under `/api/v1/`. Use structured error model `{ error: { code, message, details?, traceId } }` for consistent client handling. Explicit transition endpoints (`POST /:id/transition`) instead of PATCH for status changes.
- Alternatives considered: (1) Unversioned routes — rejected for future compatibility; (2) PATCH for status transitions — rejected because transitions have side effects (e.g., auto-set timestamps) that go beyond field updates.
- Consequences: Slightly more verbose routing but clear separation between CRUD and workflow actions.
- Rollback plan: Routes can be aliased if v1 prefix proves unnecessary.

### ADR-004: Test strategy with Vitest + Playwright + RLS abuse tests
- Date (UTC): 2026-02-16
- Agent: agent-orchestrator (Claude Code)
- Task ID: P0-T3
- Context: Need test tooling decisions. Dovelite uses Playwright with single-worker E2E and QA seed scripts. Myprogram documents RLS abuse testing in RLS_POLICY_MATRIX.md but has no automated tests.
- Decision: Use Vitest for unit/integration (fast, native ESM), Playwright for E2E (proven in Dovelite), and dedicated RLS abuse test suite (from Myprogram's security model). Two test accounts with deterministic UUIDs for cross-tenant testing.
- Alternatives considered: (1) Jest — rejected (slower, worse ESM support); (2) Cypress for E2E — rejected (heavier, less aligned with existing patterns).
- Consequences: Three test layers with clear separation. RLS abuse tests are a novel addition not present in either source.
- Rollback plan: N/A — test tooling is low-risk to change.

### ADR-005: JWT session cookies with jose library
- Date (UTC): 2026-02-16
- Agent: agent-a (Backend+Security Specialist)
- Task ID: P1-T1
- Context: Need auth/session implementation. Source repos use different approaches: Dovelite uses Supabase Auth with RLS; Myprogram uses edge functions with JWT. Neither fits ai-fsm's custom PostgreSQL requirement.
- Decision: Implement custom JWT-based sessions using `jose` library (Edge Runtime compatible). Store session in HTTP-only cookie with 7-day expiry. Use `bcryptjs` for password hashing. Role stored in JWT payload for quick access control checks.
- Alternatives considered: (1) Supabase Auth — rejected due to external dependency and RLS coupling; (2) NextAuth.js — rejected for lock-in and unnecessary OAuth complexity; (3) iron-session — rejected as jose is lighter and standards-compliant.
- Consequences: Full control over auth flow but responsible for all security considerations. Password hashing strength dependent on bcryptjs config (10 rounds chosen for Pi4 performance).
- Rollback plan: Can migrate to Supabase Auth later by keeping user IDs consistent and syncing password hashes.

### ADR-007: x-trace-id header for request-level correlation
- Date (UTC): 2026-02-17
- Agent: agent-orchestrator (Claude Code)
- Task ID: P1-T3
- Context: traceId was generated fresh per-function call in requireAuth and requireRole, producing two different UUIDs per request. audit_log had no correlation column, making it impossible to link an audit row back to the originating HTTP request.
- Decision: Extract trace ID once per request from x-trace-id or x-request-id header (or generate a UUID if absent). Thread it through AuthSession so all downstream operations (error responses, audit writes) share the same ID. Add trace_id UUID column + index to audit_log.
- Alternatives considered: (1) OpenTelemetry — rejected as overkill for MVP; (2) structured logging only (no DB column) — rejected because audit queries need trace correlation.
- Consequences: Every API error response and every audit_log row carry the same traceId for a given request. Callers (load balancer, client) can inject their own trace ID via header.
- Rollback plan: Column is nullable — existing rows unaffected. Remove column via migration if approach changes.

### ADR-008: P5-T1 Security hardening posture
- Date (UTC): 2026-02-19
- Agent: agent-orchestrator (Claude Code)
- Task ID: P5-T1
- Context: PRs #34–#41 merged. Pre-production audit identified: (1) no rate limiting on login, enabling brute-force; (2) AUTH_SECRET validated at min(1) char allowing weak secrets; (3) no HTTP security response headers; (4) password complexity unenforced at API layer.
- Decision:
  1. **Rate limiting**: In-process sliding-window Map store. Login: 5 req / 15 min per IP. Responds 429 with Retry-After header. Chosen over Redis client to avoid new dependency; appropriate for single-process Pi4 standalone deployment. Redis-backed upgrade path documented.
  2. **Env hardening**: AUTH_SECRET raised to min 32 chars (matches JWT best-practice for HS256 keys). Error messages include `[startup]` prefix and enumerate every failing field with a fix hint.
  3. **Security response headers**: Next.js Edge middleware injects `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` (frame-ancestors none), `Strict-Transport-Security`. Applied to all routes except static assets.
  4. **Password min length**: Login schema raised from min(1) to min(8). Enforced at API boundary with structured error (VALIDATION_ERROR).
- Alternatives considered:
  - Redis sorted-set rate limiter — deferred: no redis client installed; adds dependency; single process makes in-process equally effective.
  - NextAuth / Helmet npm packages — rejected: Next.js middleware header injection requires no additional package; NextAuth adds unnecessary complexity.
  - SameSite=Strict cookie — retained as lax: strict breaks same-site navigations; lax + HttpOnly + Secure is correct posture for cookie-based JWT.
  - CSRF tokens — not added: all state-changing endpoints are JSON-only API routes; SameSite=lax + Content-Type enforcement blocks CSRF on modern browsers; explicit CSRF tokens can be added if form-based submissions are introduced.
- Consequences: Login brute-force limited. Weak secrets rejected at startup. Browser-level frame injection and MIME sniffing blocked. CSP baseline established (will need tightening if external CDN assets are introduced).
- Rollback plan: Revert middleware.ts to remove headers (zero DB/migration impact). Rate limiter is in-process and stateless — removing it requires no cleanup.

### ADR-006: Build timeout with Next.js 15 static generation
- Date (UTC): 2026-02-16
- Agent: agent-a (Backend+Security Specialist)
- Task ID: P1-T1
- Context: Next.js 15 build times out during static page generation when components use `cookies()` from `next/headers`. Build hangs at "Collecting page data..." step.
- Decision: Mark all pages and API routes using cookies as `dynamic = "force-dynamic"`. Add graceful env placeholder for build-time when DATABASE_URL is not set. Document as known CI limitation — build passes locally.
- Alternatives considered: (1) Mock cookies during build — rejected as fragile; (2) Remove cookies() from server components — rejected as breaks auth flow; (3) Skip build in CI — rejected as needs verification.
- Consequences: No static optimization for auth pages (acceptable trade-off). Need to monitor build times on Pi4 target.
- Rollback plan: Next.js may fix in future release; can also switch to fully dynamic rendering with `export const dynamicParams = false`.


---

### ADR-010: UX destructive action pattern — window.confirm over modal dialog
- Date (UTC): 2026-02-19T04:00:00Z
- Agent: agent-orchestrator
- Task ID: P5-T5
- Context: Delete buttons for jobs and estimates existed as plain HTML form POSTs. These were broken (route only exports DELETE handler, not POST), and had no confirmation step — a single misclick would permanently destroy data.
- Decision: Extract delete buttons into "use client" components that call window.confirm before issuing a fetch DELETE to the API. No new dialog/modal library added.
- Alternatives considered:
  - Custom modal dialog component: adds UI complexity and CSS scope; overkill for two delete actions at current stage.
  - shadcn/ui AlertDialog or similar: introduces a component library dependency; incompatible with Pi4 bundle-size goal of minimal JS.
  - window.confirm: zero dependency, accessible (browser-native), appropriate for internal admin tooling at MVP stage.
- Consequences: Confirmation is a native browser dialog — consistent styling guaranteed. UX may feel slightly outdated vs custom modal; acceptable for operator-facing internal tool.
- Rollback plan: Replace window.confirm call with a custom inline confirm state (useState boolean) if design requirements change; logic change is isolated to the two client components.

### ADR-011: Auto-dismiss success messages via useEffect+setTimeout
- Date (UTC): 2026-02-19T04:00:00Z
- Agent: agent-orchestrator
- Task ID: P5-T5
- Context: Success messages in notes forms and transition forms persisted indefinitely after save, cluttering the UI. Financial payment success needs slightly longer visibility.
- Decision: Use useEffect to schedule clearTimeout-based auto-dismiss at 3s for general success messages and 5s for payment confirmations. Timer is cleared on component unmount to prevent state updates on unmounted components.
- Alternatives considered:
  - Toast notification library (react-hot-toast, sonner): adds a dependency, requires provider in layout; out of scope for Pi4 target.
  - Inline CSS animation (opacity fade-out): purely cosmetic — doesn't remove from DOM; screen readers would still announce stale text.
- Consequences: Zero new dependencies. Success messages self-clear. Cleanup via clearTimeout prevents memory/state leak.
- Rollback plan: Remove useEffect block to revert to persistent success message; trivial one-line deletion per component.

### ADR-012: Release-readiness doc consolidation — single authoritative path per deliverable
- Date (UTC): 2026-02-19T06:00:00Z
- Agent: agent-orchestrator
- Task ID: P5-T6
- Context: Three new required deliverables (PROD_READINESS_CHECKLIST.md, DEPLOYMENT_RUNBOOK.md, INCIDENT_RESPONSE.md) needed to consolidate five pre-existing partial docs (BACKUP_RUNBOOK.md, INCIDENT_RESPONSE_RUNBOOK.md, PI4_DEPLOYMENT.md, CI_GOVERNANCE.md, TEST_MATRIX.md) without creating conflicting guidance.
- Decision:
  1. INCIDENT_RESPONSE.md supersedes INCIDENT_RESPONSE_RUNBOOK.md. The older file is retained as historical reference but is no longer the canonical doc. A notice was added to INCIDENT_RESPONSE.md to make this clear.
  2. DEPLOYMENT_RUNBOOK.md consolidates PI4_DEPLOYMENT.md (which was a minimal stub) into a full runbook. PI4_DEPLOYMENT.md is retained for discoverability but DEPLOYMENT_RUNBOOK.md is authoritative.
  3. BACKUP_RUNBOOK.md remains the canonical backup reference; DEPLOYMENT_RUNBOOK.md and PROD_READINESS_CHECKLIST.md cross-reference it rather than duplicating content.
  4. CI_GOVERNANCE.md and TEST_MATRIX.md remain as standalone canonical references for their respective domains; PROD_READINESS_CHECKLIST.md references them.
- Alternatives considered:
  - Delete the old files: rejected — preserves historical context and avoids breaking any existing cross-references.
  - Merge everything into one mega-runbook: rejected — too large for a single operator to navigate under pressure during an incident.
- Consequences: Clear single authoritative path per deliverable. Operators should update the three new files going forward; old files are read-only references.
- Rollback plan: N/A (documentation only — no code or schema changed).
