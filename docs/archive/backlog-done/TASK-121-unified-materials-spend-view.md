# TASK-121: Unified job materials & spend view

Status:
Done

Phase:
3

Problem:
Job materials live in two places — the planned **buy list** and **ad-hoc expense
receipts** attached to the job — so there is no single view of planned vs actual
spend. (Per-task check-off is **already shipped and synced** via `VisitDayTasks`
+ `JobTasksPanel` over `work_order_tasks` — NOT in scope.)

Business Value:
One honest picture of what a job planned to spend vs what it actually spent,
feeding job profitability.

Scope:
- A single "job materials & spend" view merging the buy list and the job's
  `expenses` receipts, with a spend total rolling into job cost / the job ledger.

Out of Scope:
- Task check-off sync (already shipped — TASK-018 work-order tasks).
- Changing the Job→Visit→Work Order model.

Acceptance Criteria:
- [x] One job view shows planned buy-list items and ad-hoc receipts together with
      a spend total, comparable against the estimate.
      (Materials page: Buy list tab = plan; Purchases tab = receipts + the
      allowance/spent/remaining budget line from `loadJobLedger`, comparable to
      the estimate. Project hub shows the budget summary + a `Materials →` link.)

Notes:
From the 2026-09-05 owner workflow review (materials "mix of buy list + ad-hoc
receipts"). The task-sync half of the original idea was dropped — already built.

Shipped (#634):
- Materials page Purchases tab is the complete spend view (adds budget line +
  link-forgotten-expenses next to the receipts it already listed).
- Project hub Materials card slimmed to a summary (budget-at-a-glance + receipt
  count + deep-link), dropping the duplicated receipt list/link panel.
- `MaterialsBudgetLine` extracted so both surfaces render the budget identically.
