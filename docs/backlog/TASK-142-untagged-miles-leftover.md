# TASK-142: Night leftover — untagged claim miles

Status:
In Progress

Phase:
1

Problem:
If you log the truck and never tag a job, miles vanish from job cost.

Business Value:
Same leftover rail as unlinked receipts.

Scope:
- Count closed claim sessions in the last 14 days with no activities.
- Needs Attention row → `/app/mileage`.
- Job profitability / reports: sum tagged claim miles only (exclude GPS).

Out of Scope:
- Auto-sending or inventing tags

Acceptance Criteria:
- [ ] Untagged odometer days appear in Needs Attention
- [ ] Job mileage rollup ignores `gps_estimate` / `bt_gps_estimate` and voided
