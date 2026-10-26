# TASK-207: Record password changes in the audit log

Status:
Proposed

Epic:
EPIC-005 Platform & Delivery

Phase:
Cross-cutting

Severity:
Low.

Problem:
`apps/web/app/api/v1/users/[id]/password/route.ts` updates `password_hash`
with no audit entry. On 2026-10-26 the owner could not log in on one computer
and it was impossible to tell whether the password had changed.

Scope:
- Audit entry on every password change: who, whose account, when; never the
  hash or password.

Acceptance Criteria:
- [ ] Changing a password writes one audit row with actor and target and no
      secret fields.
