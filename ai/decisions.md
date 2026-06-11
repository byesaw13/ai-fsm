# Decision Log: Dovetails FSM

This is the living record of frozen architectural and technical decisions. AI agents should NOT propose changes to or refactor code that violates these decisions.

## Locked Technical Decisions (ADRs)

### ADR-001: System Shape
- **Decision**: TypeScript monorepo with Next.js web app (`apps/web`), raw PostgreSQL, Redis, and a background Node worker (`services/worker`).

### ADR-002: Domain Model & Currency
- **Decision**: Properties are the core entities. All monetary figures are stored as integers in **cents** (e.g. `$115.00` is `11500`). Use `users.role` for permissions, not a complex memberships junction table.

### ADR-003: API Design
- **Decision**: Version all routes under `/api/v1/`. Errors use the structure `{ error: { code, message, details?, traceId } }`. Use explicit transition endpoints (e.g., `POST /transition`) rather than PATCH for lifecycle changes.

### ADR-004: Test Stack
- **Decision**: Vitest for fast unit/integration testing, Playwright for E2E testing, and a dedicated database test suite for Row-Level Security (RLS) policies.

### ADR-005: Auth & Sessions
- **Decision**: Custom JWT sessions using the `jose` library stored in HTTP-only cookies. Password hashing uses `bcryptjs` (10 rounds for performance).

### ADR-006: Rendering Engine
- **Decision**: All Next.js pages or API routes reading cookies must define `export const dynamic = "force-dynamic"` to bypass Next.js 15 static analysis compile hangs.

### ADR-007: Traceability
- **Decision**: Extract trace ID once per request from incoming headers and store in DB audit logs under `trace_id` UUID columns to correlate request execution.

### ADR-008: Security Hardening
- **Decision**: Login rate-limiting (5 requests/15 minutes per IP), mandatory HTTP security headers in middleware, and a minimum password length of 8 characters.

### ADR-010: UI Confirmation
- **Decision**: Administrative destructive operations (e.g., deletions) use standard browser-native `window.confirm` to keep JS bundles lightweight.

### ADR-011: UI Notifications
- **Decision**: Success alerts auto-dismiss using `useEffect` timers (3 seconds for general events, 5 seconds for financial/payment confirmations).

### ADR-013: Production Target
- **Decision**: The single, authoritative production deployment target is `garonhome.local` (running at `/opt/business/ai-fsm` on x86 Debian). Raspberry Pi targets are legacy/deprecated.
