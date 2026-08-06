# TASK-087: Materials catalog UI + SKU search

Status:
Done

Phase:
3

Problem:
There is no product UI for browsing or editing the materials price catalog
(the service Price Book is a different catalog).

Business Value:
Owner can look up last/avg paid by name or barcode when pricing a job or
checking spend patterns.

Scope:
- Page `/app/materials` with search (name/SKU), category/supplier filters,
  last/avg/count display, edit/deactivate.
- Settings link next to Price Book / Expenses.
- GET `/api/v1/materials` search includes SKU.

Out of Scope:
- Field tech primary nav entry.
- Estimate material picker integration.

Acceptance Criteria:
- [x] Owner/admin can open Materials Catalog, search by SKU, edit a row.
- [x] Settings exposes the link.
- [x] Empty state points at receipt upload and import.

Notes:
`/app/materials` + Settings → Materials Catalog. Archived in backlog truth
pass 2026-08-05.
