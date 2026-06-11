# Common Mistakes: Dovetails FSM

This is a list of real-world bugs and architectural pitfalls encountered in this codebase. Read these before writing any database, worker, or routing logic.

## 1. Database Connection Management (Worker Service)
- **The Mistake**: Wrapping database query calls in a generic `try-catch` block inside a background polling task and logging the error *without* rethrowing it.
- **The Issue**: When the database restarts, the persistent client loses connection and throws `Client has encountered a connection error and is not queryable`. Because the polling iteration swallows the error, the outer interval runner never catches it and the container gets trapped in an infinite failure loop.
- **The Fix**: Always detect and propagate/rethrow database-level connection failures so the outer runner can trigger a clean client destruction and database reconnection.

## 2. PostgreSQL Parameter Type Mismatches
- **The Mistake**: Reusing the same query parameter `$2` for string interval math (e.g. `($2 || ' days')::interval`) and numeric comparisons (e.g. `EXTRACT(DAY FROM ...) >= $2`).
- **The Issue**: PostgreSQL infers the parameter's type as `text` due to the string concatenation operator (`||`). When compared to a numeric extract output, this triggers a runtime query crash: `ERROR: operator does not exist: numeric >= text`.
- **The Fix**: Always apply explicit typecasts to parameterized variables in SQL queries when they serve multiple purposes (e.g., `($2::text || ' days')` and `$2::int`).

## 3. Row-Level Security Role Misconceptions
- **The Mistake**: Writing RLS policies that target standard roles like `authenticated` or `anon` (e.g. `TO authenticated`).
- **The Issue**: This repository uses custom session variables and does not define standard postgres roles. Policies written with `TO authenticated` will fail to compile or bypass custom RBAC rules.
- **The Fix**: Always write RLS policies using the custom security definer helper functions (`app_account_id()` and `is_owner_or_admin()`) to enforce tenant-scoped isolation.

## 4. Currency Precision
- **The Mistake**: Storing prices as decimal values (e.g. `12.50`) or doing floating-point arithmetic.
- **The Issue**: Floating-point precision issues cause minor rounding discrepancy bugs in invoices and financial reports.
- **The Fix**: Always use integer cents (`1250`) for money.

## 5. Next.js static generation compile hangs
- **The Mistake**: Leaving off the dynamic rendering flag on Next.js pages or API routes that call `cookies()`.
- **The Issue**: Next.js 15 attempts to statically pre-render pages during the build step, causing page data collection to hang indefinitely on routes that access cookies.
- **The Fix**: Always declare `export const dynamic = "force-dynamic";` at the top of any server route or page that accesses auth cookies.
