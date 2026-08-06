# TASK-084: Job Ledger — estimate vs actual on the project page

Status:
Done

Phase:
3

Problem:
T&M commercial truth (estimate allowances, billable hours, materials receipts,
lift, deposits, change orders) is scattered across estimate, materials, tracked
days, and profitability. Owners need AI or spreadsheets to answer "what do we
bill / CO?" for jobs like Claremont.

Business Value:
One Job Ledger on the project page makes estimate vs actual, balance, and draft
change orders navigable without leaving the job — honest money, one place to look.

Scope:
- Job Ledger card on `/app/jobs/[id]` (customer rates, not internal cost).
- Domain `buildJobLedger` composition of estimate lines, job_work hours,
  materials receipts, equipment, COs, paid invoices.
- Draft CO from variance (draft only; COs remain estimate-scoped).
- Expense `commercial_tag` for Schedule A/B / equipment.
- Internal P&L remains separate (cost margin).

Out of Scope:
- Client portal ledger; auto-send CO/invoice; SKU plan↔receipt matching;
  dedicated `/money` page (v2 if needed).

Acceptance Criteria:
- [x] Opening a T&M project shows Sold / Actual / Paid / Balance and bucket
      variance without chat.
- [x] Labor actual uses tracked hours × customer rate from estimate.
- [x] Materials actual vs allowance; Draft CO when over and estimate approved.
- [x] Open draft CO or approved coverage suppresses duplicate draft button.
- [x] Flat-rate balance stays sold − paid even when materials receipts exist.
- [x] Multi-option estimate lines with `option_id` are excluded from budgets.
- [x] Techs do not see the ledger.

Notes:
Spec: `docs/superpowers/specs/2026-07-30-job-ledger-design.md`.
Shipped PR #546 (`a6566ea`); migration `162_expense_commercial_tag.sql`.
**ID history:** originally filed as TASK-081 in EPIC-004, colliding with nested
hubs TASK-081 in EPIC-006. Renumbered to TASK-084 in backlog truth pass
2026-08-05 (IDs are permanent; hubs keeps 081).
