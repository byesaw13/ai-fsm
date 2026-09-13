# TASK-140: Mileage page — claim vs GPS hops

Status:
In Progress

Phase:
1

Problem:
The mileage month view sums odometer and auto GPS into one total and lists
voided/sub-mile hops as extra trips.

Business Value:
The number at the top is the tax claim, not claim plus a GPS witness.

Scope:
- Headline: claim miles (odometer + manual). GPS miles as corroboration only.
- Group by day; nest GPS hops; hide voided and hops &lt; 1.0 mi.
- Show `miles_source` on rows.

Out of Scope:
- Stopping auto-insert of GPS sessions
- Personal vs business split

Acceptance Criteria:
- [ ] Month total equals sum of non-voided odometer/manual sessions
- [ ] GPS hops do not inflate that total
- [ ] Voided rows and sub-mile GPS hops are hidden by default
