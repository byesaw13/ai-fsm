# TASK-125: Nav restructure — Jobs→Projects, drop Work Orders from nav

Status:
Done

Phase:
cross-cutting

Problem:
A2 of the simplification plan. The nav labelled the work pipeline "Jobs" while
the pages already say "Projects" (jobs list, create, visit forms), and
**Work Orders** sat as a top-level nav item though it's really a detail inside a
Project. Five work nouns to hold; two of them inconsistent/redundant at the top.

Business Value:
The owner nav reads as the pipeline they think in — Requests → Estimates →
Projects → Invoices — with Work Orders reached inside a Project, not competing at
the top. Fewer top-level nouns, consistent "Projects" wording.

Scope:
- `getNavSections` (AppShell): rename the Jobs nav item to **"Projects"**; drop
  `NAV_WORK_ORDERS` from the Work hub (route + page kept; reached from a Project).
- Routes unchanged (`/app/jobs`, `/app/work-orders`) — deep links + PWA survive;
  Work Orders still reachable from the Job/Project detail's Work Orders section.

Out of Scope:
- Renaming every "Job" mention to "Project" (job detail body copy, report column
  headers) — primary nav/list/create surfaces only.
- Removing Visits from tech nav (techs need it).
- Any data-model change (Job→Visit→Work Order stays).

Acceptance Criteria:
- [x] Owner/admin nav shows "Projects" (not "Jobs") and no top-level Work Orders.
- [x] Work Orders remain reachable from a Project's detail; routes unchanged.
- [x] `getNavSections` unit tests updated; `pnpm gate:fast` green.

Notes:
A2 from the 2026-09-05 plan. Pairs with TASK-124 (naming). Nav labels/structure
only — no routes, no schema. Shipped #631 (incl. WORK_HUB_LINKS cleanup).
