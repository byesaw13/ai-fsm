# TASK-162: Job Reports — publish finished work to the customer

Status:
In progress

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
  share_token, summary, area, work_type (improvement|repair|maintenance), media_ids, records (jsonb, copied text), sponsored, status
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

Implementation notes (2026-09-25):
- Migration 198. "Keep for your records" is stored as copied text in
  `records` jsonb ([{label, detail}]), not as invoice line ids. Invoice edits
  can't change or break a published report, and TASK-165 reads the same field.
- Summary pre-fill: invoice work summary → specific labor lines (generic ones
  like "Labor" and "Travel" are skipped) → job title (not intake auto-titles)
  → blank. Tech notes are never used.
- Photos: after/before/during/assessment are offered and "after" is
  preselected. Receipts are never offered or served. The public media route
  re-checks that the photo is in the report, from the report's job, and in a
  customer category.
- Texting appears only when the SMS gateway is configured and the client has
  consented. Otherwise use Copy link or Email.
- Entry point: "Customer report →" on the job page Photos header. Published
  reports appear as "What we did" at the top of the portal (not sponsored ones).
- Checked in staging on a copy of production data with the real photos
  mounted read-only: published Kim's porch job, opened it as the customer,
  emailed it (caught by a test inbox), and saw it in her portal.
