# Locked Decision Summary

> [!IMPORTANT]
> **Authoritative Source**: [docs/DECISION_LOG.md](file:///home/nick/ai-fsm-deploy-clean/docs/DECISION_LOG.md). If conflicts exist, the canonical log always wins.

This is a distilled summary of the locked architectural decisions for AI tools. Do NOT propose changes that violate these points.

## Critical Technical Reminders

- **No ORM**: Monorepo uses raw SQL migrations and `pg` client/pool.
- **Raw SQL Database**: All persistence logic and Row-Level Security (RLS) use native PostgreSQL features.
- **Property-Centric Model**: Properties are the core entities. Clients own contact info, properties own timeline history, jobs own execution, visits own scheduling, and invoices own billing.
- **Money in Cents**: All monetary amounts are stored as integers in **cents** (e.g., `$115.00` is `11500`).
- **Edge rendering**: Any Next.js pages or routes reading cookies must define `export const dynamic = "force-dynamic"` to bypass Next.js 15 static analysis compile hangs.
- **Session Auth**: Custom JWT cookies via `jose` library, password hashing via `bcryptjs` (10 rounds).
- **Simple UI elements**: Destructive actions use native browser `window.confirm` to keep JS bundles lightweight.
