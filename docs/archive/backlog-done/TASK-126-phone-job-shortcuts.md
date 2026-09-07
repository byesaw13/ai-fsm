# TASK-126: Phone job shortcuts go to the matching job surface

Status:
Done

Phase:
2

Problem:
On the phone job page, Scope / Photos / Materials / Notes all hashed to the
active visit (`#visit-issue` / `#visit-parts` / `#visit-resolution`). Those
cards only exist on repair-flow visits, so a normal job dumped every button
onto the same visit page.

Business Value:
Each shortcut opens the thing it names — this job's scope, this job's photos,
this job's materials, this project's notes — so the phone work page is a
reference, not a maze.

Scope:
- Retarget the four `MobileJobAction` links: in-page `#job-scope` / `#job-photos`
  / `#job-notes`, and `/app/jobs/:id/materials`.
- Photos: gallery of `visit_media` for this job. Notes: intake + visit tech
  notes for this job only. Complete Visit still opens the visit.

Out of Scope:
- New upload UI (capture still happens on the visit).
- Desktop job hub layout.

Acceptance Criteria:
- [x] Photos / Materials / Notes / Scope no longer all land on the same visit page.
- [x] Materials opens the job materials page.
- [x] Notes lists this project's notes only.

Shipped (#635).
