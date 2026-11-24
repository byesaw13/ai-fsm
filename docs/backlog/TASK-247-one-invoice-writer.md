# TASK-247: One function creates invoices, with one set of duplicate rules

Status:
Done

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
High. A customer can be billed twice for the same project.

Problem:
Six places write `INSERT INTO invoices`, each with its own column list and its own "already exists?" check:
`lib/estimates/approve.ts` (deposit), `app/api/v1/jobs/[id]/deposit-invoice/route.ts`, `app/api/v1/jobs/[id]/progress-invoice/route.ts`, `app/api/v1/estimates/[id]/convert/route.ts` (final), `lib/invoices/final-invoice.ts` (final, from visit closeout), `app/api/v1/invoices/route.ts` (manual).
The checks disagree:
- Deposit: `approve.ts:46` counts a voided deposit as existing; the deposit route ignores voided ones.
- Final: convert checks only `final` for the estimate; closeout checks `final` and `standard` for the job. A manual standard invoice followed by Convert bills the project twice.
Audit 2026-11-24.

Scope:
- `lib/invoices/create-invoice.ts`: `createInvoice(client, { kind, ... })` owns the number (`generateInvoiceNumber`), the insert, and the duplicate rule per kind:
  - deposit: one non-void deposit per estimate;
  - final: one non-void `final` or `standard` invoice per job (and per estimate);
  - progress and manual standard: no automatic dedupe (owner-chosen amounts).
- The six callers use it. Remove their inline inserts and checks.
- When a duplicate exists, return it with `created: false` (current convert/deposit behavior). The manual invoice route answers 409 `INVOICE_EXISTS` with the existing invoice's id instead of creating a second one.
- Migration 218 backs the rule with unique partial indexes (void ignored): one open final-or-standard per job, one open final per estimate (replaces the 104 index, which also counted void so a voided final could never be replaced), one open deposit per estimate. Production had no violating rows on 2026-11-24.

Out of scope:
- Changing invoice totals, deposit math or line-item building (they stay in the callers).
- Merging existing duplicate invoices (list any found in the PR for the owner; G4).

Acceptance Criteria:
- [x] `rg "INSERT INTO invoices\b" apps/web services` finds one hit.
- [x] Convert on a job that already has a non-void standard invoice returns that invoice and creates none.
- [x] A voided deposit does not block a new deposit invoice from approval or from the job page.

Test Plan:
- Unit/integration: each kind's duplicate rule; the convert-after-manual case.
- Read-only production query in the PR: jobs with more than one non-void final/standard invoice.

Related:
TASK-246, TASK-154, TASK-251.
