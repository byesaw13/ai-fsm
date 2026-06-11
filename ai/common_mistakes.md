# Common Mistakes To Avoid

This is a compact AI reference derived from docs/canonical/DOMAIN_MODEL.md, docs/canonical/ARCHITECTURE.md, docs/canonical/WORKFLOW.md, and existing code conventions. If this file conflicts with docs/canonical, docs/canonical wins.

- Do not introduce an ORM. Database access uses raw SQL through the existing `pg` helpers.
- Do not create duplicate entities such as Project, Work Order, Service Call, Appointment, Site, Home, or Customer when Client, Property, Job, and Visit already exist.
- Do not make `jobs.scheduled_start` or `jobs.scheduled_end` the scheduling source of truth. Visits own scheduling.
- Do not duplicate pricing constants outside `packages/domain/src/dovetails.ts`.
- Do not treat reports, dashboards, pipelines, or command centers as sources of truth. They are derived views.
- Do not use archived or generated docs as active product instructions.
- Do not add new durable nouns unless they clarify the canonical model or the canonical docs are updated.
- Do not store workflow presentation stages as separate workflow state when they can be derived.
