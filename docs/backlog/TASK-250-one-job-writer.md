# TASK-250: One function creates jobs, and a job always has a property

Status:
In Progress

Epic:
EPIC-003 Property Intelligence

Phase:
2

Severity:
Medium. Jobs from texts have no property, so their work never reaches the property's history.

Problem:
Six places write `INSERT INTO jobs`: `lib/estimates/create-job-db.ts`, `lib/day-review/apply-stop-interview.ts`, `lib/intake/records.ts`, `app/api/internal/sms/route.ts`, `app/api/v1/jobs/route.ts`, `app/api/v1/quick-book/route.ts`. The SMS path inserts no `property_id`, and `jobs.property_id` is nullable. Starting status differs by door (`quoted`, `draft`, or the column default). The product is property-centered (PRODUCT_VISION). Audit 2026-11-24.

Scope:
- PR 1: `lib/jobs/create-job.ts`: `createJob(db, {...})` is the only `INSERT INTO jobs` (seven call sites in six files). When no property is given and the customer has exactly one, that one is filled in, in the same statement. Callers keep their own starting status.
- PR 2 (owner decision first): whether `property_id` is required. 22 production jobs belong to customers with no property on file, and requiring one would block approving an estimate for such a customer.
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
