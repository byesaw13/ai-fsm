# Decision Reminders: Dovetails FSM

This is a compact AI reference derived from docs/DECISION_LOG.md and docs/canonical/ARCHITECTURE.md. If this file conflicts with docs/canonical, docs/canonical wins. If this file conflicts with docs/DECISION_LOG.md for formal ADR history, docs/DECISION_LOG.md wins.

Use this as locked decision reminders only. It is not the formal decision log.

## Locked Decision Reminders

- System shape: TypeScript monorepo with Next.js web app (`apps/web`), raw PostgreSQL, Redis, and a background Node worker (`services/worker`).
- Domain and money: properties are core entities; monetary figures are stored as integer cents.
- API design: version routes under `/api/v1/`; structured errors use `{ error: { code, message, details?, traceId } }`; lifecycle changes use explicit transition endpoints.
- Test stack: Vitest for unit/integration tests; Playwright for E2E tests; database tests cover RLS policies.
- Auth and sessions: custom JWT sessions use `jose` in HTTP-only cookies; password hashing uses `bcryptjs`.
- Rendering: pages or API routes reading cookies use `export const dynamic = "force-dynamic"`.
- Traceability: extract trace ID once per request and carry it through audit/log writes.
- Security: keep login rate limiting, HTTP security headers, and minimum password length.
- UI confirmation: destructive admin operations use browser-native `window.confirm`.
- UI notifications: success alerts auto-dismiss using existing timer patterns.
- Production target: `garonhome.local` under `/opt/business/ai-fsm` is the active production deployment target.
