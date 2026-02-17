-- =============================================================================
-- 005_audit_log_trace_id.sql — Add trace_id to audit_log
-- P1-T3 | agent-orchestrator | 2026-02-17
--
-- Adds end-to-end request correlation to audit entries.
-- The app layer populates trace_id from x-trace-id / x-request-id request
-- headers (or a freshly generated UUID if absent) via apps/web/lib/tracing.ts.
-- =============================================================================

alter table audit_log
  add column if not exists trace_id uuid;

create index if not exists idx_audit_log_trace
  on audit_log(trace_id);
