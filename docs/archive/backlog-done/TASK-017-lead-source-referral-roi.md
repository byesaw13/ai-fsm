# TASK-017: Lead Source / Referral ROI

Status:
Done

Phase:
3

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
- [x] Revenue can be grouped by lead source / referrer.
- [x] A report shows ROI per source.

Notes:
Thin ship (Wave 4, 2026-08-05):

- Pure helpers in `packages/domain/src/referral-roi.ts` (normalize source labels,
  conversion rate, paid-per-job, sort by paid revenue).
- `GET /api/v1/reports/referrals?month=YYYY-MM` — owner/admin; groups
  `booking_requests` by `referral_source` for the month; joins invoices on
  `job_id` (void excluded). Realtor name/brokerage breakdown included.
- UI at `/app/reports/referrals` with month filter + link from Profitability.
- Domain unit tests for rollup math.

Does not add paid-ad integrations or marketing spend tracking.
