# TASK-261: Owner alert emails raised outside a transaction are never queued

Status:
In Progress

Epic:
EPIC-005 Platform & Delivery

Phase:
cross-cutting

Severity:
Medium. Owner alert emails (for example an invoice opened from the customer link) are silently dropped when the caller has no open transaction.

Problem:
`emitAttentionEvent` (`apps/web/lib/attention/emit.ts`) wraps the email enqueue in `SAVEPOINT attention_email`. Outside a transaction Postgres rejects SAVEPOINT (25P01), the catch logs it as a non-fatal email failure, and the email is never queued. Found in the J2 production check on 2026-11-25.

Scope:
- When SAVEPOINT fails with 25P01, enqueue without a savepoint (autocommit has no caller transaction to protect). Inside a transaction, behavior is unchanged.

Out of scope:
- Re-sending alerts that were dropped before the fix.

Acceptance Criteria:
- Outside a transaction, a new email-type attention event queues one owner email.
- Inside a transaction, a failed enqueue still rolls back to the savepoint and does not abort the caller.

Test Plan:
- `apps/web/lib/attention/__tests__/emit.unit.test.ts` covers both paths and the rollback.

Related:
TASK-256, TASK-257 (J2 check)
