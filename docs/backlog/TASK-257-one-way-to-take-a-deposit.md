# TASK-257: One way to take a deposit

Status:
Done

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
Low. Unused money code is still code that can be wrong on an invoice, a PDF or a payment link.

Decision (owner, 2026-11-25): keep separate deposit invoices only; remove the unused "deposit due on this invoice" option.

Problem:
A deposit can be taken two ways: a separate deposit invoice (`invoice_kind = 'deposit'`, credited on the final invoice; used) and deposit fields on the invoice itself (`invoices.deposit_type`, `deposit_percentage`, `deposit_fixed_cents`: a first payment due on that same document). The second has been set on 0 of 61 invoices but is wired into the invoice page, print page, PDF loader, portal page, portal pay route, Square payment-link route and `InvoiceDepositForm.tsx` through `requestedDepositCents`. "Deposit as a percentage of the total" is also written three times: `calculateDepositPolicy` (`lib/estimates/deposit-policy.ts`), `requestedDepositCents` and `defaultDepositCents` (`lib/invoices/deposit.ts`). The estimate deposit type "materials" is unused too (0 estimates). Second audit 2026-11-25.

Scope:
- Remove the invoice-level deposit option from those seven places and delete `InvoiceDepositForm.tsx` and `requestedDepositCents`. The amount due on an invoice is its balance.
- One helper for "percentage of a total, clamped", used by the estimate deposit policy and the job deposit gate.
- Leave the three invoice columns in the database (no destructive migration); stop reading and writing them.

Out of scope:
- Deposit invoices, deposit credit on the final invoice, the estimate deposit settings.
- Removing the "materials" deposit type (ask the owner separately if wanted).

Acceptance Criteria:
- [x] `rg "requestedDepositCents|InvoiceDepositForm"` finds nothing.
- [x] Invoice page, print, PDF, portal and Square link show and charge the invoice balance for every existing invoice (same amounts as before for all 61).
- [x] One percentage helper; the estimate and job deposit amounts are unchanged.

Test Plan:
- Unit: the shared percentage helper; deposit gate amounts unchanged.
- Read-only production check before and after: every invoice's amount due is unchanged.

Related:
TASK-120 (deposit gate), TASK-233 (percentage deposit survives a save), TASK-247.
