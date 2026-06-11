# Current Sprint: Dovetails FSM

## Sprint Goals & Deliverables

### TASK-001: Background Worker Resilience
- **Objective**: Fix the background worker container getting trapped in an infinite error loop when PostgreSQL restarts.
- **Scope**:
  - Propagate connection errors out of `runPollIteration()` in `services/worker/src/index.ts`.
  - Update `tick()` catch block to recognize PG-client connection-level error messages (`"connection error"`, `"not queryable"`, and `"Connection terminated"`) and cleanly reconnect.
- **Status**: **Completed & Hotfixed**.

### TASK-002: Recurring Inspection SQL Typecast Fix
- **Objective**: Fix the SQL error `operator does not exist: numeric >= text` that crashed the worker's recurring inspection loop.
- **Scope**:
  - Update `services/worker/src/recurring-inspection.ts` to convert the `HAVING` clause to a standard `AND` condition inside the `WHERE` block.
  - Explicitly typecast parameter `$2` as `text` for string interval concatenations and `int` for numeric day comparisons.
- **Status**: **Completed & Hotfixed**.

### TASK-003: Ephemeral Test Container Cleanup
- **Objective**: Identify and prune orphaned test containers (`ai-fsm-gate-pg-*` and `ai-fsm-gate-redis-*`) left on the server.
- **Status**: **Completed**.

### TASK-004: AI Memory Directory Initialization
- **Objective**: Create the `/ai/` directory in the monorepo root to house distilled, static files representing context, architecture, rules, pricing, roadmap, sprint state, and decision logs to optimize AI agent session performance.
- **Status**: **Completed**.
