# TASK-250: One function creates jobs, and a job always has a property

Status:
Proposed

Epic:
EPIC-003 Property Intelligence

Phase:
2

Severity:
Medium. Jobs from texts have no property, so their work never reaches the property's history.

Problem:
Six places write `INSERT INTO jobs`: `lib/estimates/create-job-db.ts`, `lib/day-review/apply-stop-interview.ts`, `lib/intake/records.ts`, `app/api/internal/sms/route.ts`, `app/api/v1/jobs/route.ts`, `app/api/v1/quick-book/route.ts`. The SMS path inserts no `property_id`, and `jobs.property_id` is nullable. Starting status differs by door (`quoted`, `draft`, or the column default). The product is property-centered (PRODUCT_VISION). Audit 2026-11-24.

Scope:
- `lib/jobs/create-job.ts`: `createJob(client, {...})` with the insert, starting status rule and a required `property_id`. The six callers use it.
- The SMS path uses the customer's only property when there is one; otherwise it creates a request (not a job) so the address is asked for, the same as intake.
- Read-only query in the PR: jobs with no property, for the owner.

Out of scope:
- Making `jobs.property_id` NOT NULL in the database (after the owner has fixed the existing rows; a later task).

Acceptance Criteria:
- [ ] `rg "INSERT INTO jobs\b" apps/web services` finds one hit.
- [ ] No code path creates a job without a property.
- [ ] A text from a customer with no property creates a request, not a job.

Test Plan:
- Unit: starting status per door.
- Integration: SMS intake with zero and one property.

Related:
TASK-249, TASK-245.
