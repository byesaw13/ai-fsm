# TASK-254: Print shows the same PDF the customer gets

Status:
Proposed

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
Low. The printed and the emailed estimate or invoice are drawn by different code and can differ.

Problem:
Estimates and invoices are drawn twice: HTML print pages (`app/app/estimates/[id]/print`, `app/app/invoices/[id]/print`, about 860 lines) and the PDF builder (`lib/pdf/document-pdf.ts`, `buildEstimatePdf`, `buildInvoicePdf`) used for what the customer receives. Wording or letterhead changes (TASK-226, TASK-235) have to land in both. Audit 2026-11-24.

Scope:
- Owner gate: confirm the PDF is acceptable for printing in the office.
- The estimate and invoice print routes return the PDF (inline), and the HTML print pages and their helpers are removed. Routes stay.

Out of scope:
- The visit print page (it has no PDF).
- Changing the PDF's content.

Acceptance Criteria:
- [ ] Print on an estimate and an invoice opens the same PDF the customer gets.
- [ ] No HTML print component remains for estimates or invoices.

Test Plan:
- E2E: print route returns `application/pdf` for an estimate and an invoice.

Related:
TASK-226, TASK-235.
