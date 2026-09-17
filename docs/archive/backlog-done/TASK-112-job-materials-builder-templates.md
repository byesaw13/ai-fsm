# TASK-112: Job materials builder templates (Build from tasks)

Status:
Done

Phase:
3

Problem:
Jobs without a trustworthy estimate shopping list still need a deterministic
buy list. PR #592 adds price-book packs and Job Materials “Build from tasks.”
Name-match seeds from the first draft attached the wrong packs (wax ring on a
flapper job). Commit was blind. AI generate sat as a peer primary.

Business Value:
Owner can apply a known task pack to the job buy list without AI setting
prices, then walk Store Run. Complements TASK-103 (1007 takeoff into
shopping_list → seed) for T&M / no-estimate jobs.

Scope:
- `price_book_material_templates` keyed by explicit `price_book.code` only
  (2005, 1007, 1003, 4010, 4005). No LIKE name-match seeds.
- Preview then confirm; one primary action; AI/seed in More.
- Catalog resolve by name/unit; merge with estimate seed; `task_qty`.

Out of Scope:
- Replacing the table with `service_materials`.
- Shopping-list takeoff spine (TASK-103).
- Template CRUD UI.

Acceptance Criteria:
- [x] 2003 / 7009 / 5008 have zero templates after migration 174.
- [x] Build from tasks shows preview lines before insert.
- [x] Tech cannot POST `/materials/build` (403).
- [x] Second commit of the same pack does not duplicate needed lines.

