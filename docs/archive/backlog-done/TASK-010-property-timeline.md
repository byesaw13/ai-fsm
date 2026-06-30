# TASK-010: Property Timeline

Status:
Done

Problem:
A property's history (visits, estimates, jobs, invoices, evidence) was scattered
across workflow pages instead of tied to the property.

Business Value:
A property-centered timeline is a core differentiator and makes service history
easy to find from any surface.

Scope:
- A timeline on the property record aggregating related activity.
- Service history tied to the property rather than scattered.

Out of Scope:
- Predictive/AI summarization of the timeline.

Acceptance Criteria:
- [x] The property page shows a chronological timeline of related activity.
- [x] History is reachable from the property record.

Notes:
Shipped. `apps/web/app/app/properties/[id]/PropertyTimeline.tsx`,
`db/migrations/103_property_timeline_flat_columns.sql`, with property-history
tests. Aligns with ROADMAP Phase 2 (Property-Centered Workflow).
