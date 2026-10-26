# TASK-203: Portal approval matches the email and owner approval paths

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium.

Problem:
`apps/web/app/api/portal/estimates/[token]/route.ts` (POST) writes no audit
log, workflow event or owner attention item and does not advance the booking
request, unlike `apps/web/app/api/v1/estimates/[id]/respond/route.ts`. It also
accepts a response on an already approved or declined estimate; the database
trigger rejects it and the customer sees an unhandled 500 (double-click
Approve, or approve after decline).

Scope:
- Portal approve and decline write the same audit, workflow event, attention
  item and booking-request change as the email path.
- A response to an estimate that is no longer "sent" returns 409 with a plain
  message and the current status; an approve repeated on an approved estimate
  returns 200 without side effects.

Acceptance Criteria:
- [ ] A portal approval creates an "Estimate approved" attention item.
- [ ] Two approve clicks give one job, one deposit invoice and no error.
- [ ] Approve after decline returns 409 with "already declined".
