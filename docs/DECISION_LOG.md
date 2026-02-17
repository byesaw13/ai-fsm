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

### ADR-006: Build timeout with Next.js 15 static generation
- Date (UTC): 2026-02-16
- Agent: agent-a (Backend+Security Specialist)
- Task ID: P1-T1
- Context: Next.js 15 build times out during static page generation when components use `cookies()` from `next/headers`. Build hangs at "Collecting page data..." step.
- Decision: Mark all pages and API routes using cookies as `dynamic = "force-dynamic"`. Add graceful env placeholder for build-time when DATABASE_URL is not set. Document as known CI limitation — build passes locally.
- Alternatives considered: (1) Mock cookies during build — rejected as fragile; (2) Remove cookies() from server components — rejected as breaks auth flow; (3) Skip build in CI — rejected as needs verification.
- Consequences: No static optimization for auth pages (acceptable trade-off). Need to monitor build times on Pi4 target.
- Rollback plan: Next.js may fix in future release; can also switch to fully dynamic rendering with `export const dynamicParams = false`.
