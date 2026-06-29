# EPIC-003: Property Intelligence

**Epic status: Proposed / Strategic.** Beyond the shipped Property Timeline,
this epic is exploratory. It is not in `docs/canonical/ROADMAP.md` and is held
per the roadmap's "Out of Scope" guidance until the core workflow phases are
stable. Recorded so the ideas are not lost — not a commitment to build.

## Active tasks

# TASK-011: Property Opportunities

Status:
Proposed

Problem:
Issues a tech notices on site ("deck needs sealing next year") are lost if not
turned into an estimate immediately.

Business Value:
Captures future revenue that would otherwise be forgotten; supports proactive
outreach.

Scope:
- Record opportunities against a property with a note and rough timeframe.
- Surface open opportunities from the property record.

Out of Scope:
- Automated marketing/outreach campaigns.

Acceptance Criteria:
- [ ] An opportunity can be logged against a property during/after a visit.
- [ ] Open opportunities are visible from the property.

Notes:
Strategic. Not implemented. (Also referred to as "Opportunity Tracking".)

# TASK-012: Property Health Records

Status:
Proposed

Problem:
There is no consolidated view of a property's systems, materials, and condition
over time.

Business Value:
A durable property record differentiates Dovetails and supports maintenance
planning.

Scope:
- Structured health/condition records tied to the property.

Out of Scope:
- Sensor/IoT integrations.

Acceptance Criteria:
- [ ] Condition records can be attached to a property and viewed over time.

Notes:
Strategic. Not implemented.

# TASK-013: Maintenance Plan Fit Scoring

Status:
Proposed

Problem:
No signal for which properties are good candidates for a maintenance plan.

Business Value:
Focuses plan sales on the best-fit properties.

Scope:
- A fit score derived from property/service history.

Out of Scope:
- Pricing or billing of plans (covered by membership features).

Acceptance Criteria:
- [ ] A property shows a fit indicator for maintenance-plan suitability.

Notes:
Strategic. Maintenance plans exist (`apps/web/app/app/maintenance-plans/*`), but
no fit scoring is built.

## Completed

- [TASK-010: Property Timeline](done/TASK-010-property-timeline.md) — Done
