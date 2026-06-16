# EPIC-004: Billing & Profitability

Closing the loop from completed work to invoice, payment, and an honest picture
of what each job actually earned.

## Active tasks

# TASK-017: Lead Source / Referral ROI

Status:
In Progress

Problem:
It is hard to tell which lead sources and referrals actually produce profitable
work.

Business Value:
Directs marketing/referral effort toward what pays off.

Scope:
- Attribute jobs/revenue to lead source and referral.
- Report ROI by source.

Out of Scope:
- Paid-ad platform integrations.

Acceptance Criteria:
- [ ] Revenue can be grouped by lead source / referrer.
- [ ] A report shows ROI per source.

Notes:
Partial: `apps/web/app/api/v1/reports/referrals/route.ts` exists; the full ROI
rollup is not complete.

## Completed

- [TASK-014: Invoice Generation from Visits](done/TASK-014-invoice-generation-from-visits.md) — Done
- [TASK-015: Payment Tracking](done/TASK-015-payment-tracking.md) — Done
- [TASK-016: Job Profitability](done/TASK-016-job-profitability.md) — Done
