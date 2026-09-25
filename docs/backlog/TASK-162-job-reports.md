# TASK-162: Job Reports — publish finished work to the customer

Status:
Proposed

Phase:
2 (roadmap exception: one new table, `portal_job_updates`)

Epic:
EPIC-003 Property Intelligence

Problem:
The customer vault is empty (0 rows in every vault table) while 217 job
photos, visit notes and itemized product lines never reach the customer.

Business Value:
Proof of work the customer opens from a text with no login; the permanent
property record builds itself from completed jobs. Design: `docs/designs/customer-home-record-job-reports.md` (approved 2026-09-24).

Scope:
- Migration: `portal_job_updates` (job_id unique, property_id, client_id,
  share_token, summary, area, work_type (improvement|repair|maintenance), media_ids, installed_line_ids, status
  draft|published|withdrawn, published_at, first_viewed_at, view_count) + RLS.
- `/app/jobs/[jobId]/customer-update`: summary pre-fill = work_summary → job
  title + labor line names → blank (never tech notes); after photos preselected,
  before shown side-by-side only when both exist; "Keep for your records" lines
  listed unticked + free-text item. Two quick picks: area and type. Publish & text/email. Receipt photos never
  offered.
- Publishing requires an invoice not draft/void; recipient = its client_id;
  mixed payers block publish.
- `/portal/reports/[token]`: photos, summary, installed items, date, address;
  noindex, no-referrer; media only via token route that re-checks media_ids;
  withdraw rotates the token. Views not counted for staff/preview.
- Sponsored payer: minimum property identity only; shown in Sponsored Work.

Acceptance Criteria:
- [ ] Unpublished/unticked photos and receipts are never reachable.
- [ ] Withdrawn or rotated token 404s; out-of-set media id 404s.
- [ ] Sponsored report leaks no installed items or vault data to the realtor.
