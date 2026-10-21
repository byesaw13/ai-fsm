# TASK-176: Owner system map

Status: In progress
Phase: cross-cutting
Epic: EPIC-006 Role-based workspaces

Problem:
The backlog and the canonical docs record what to build, but the owner cannot
see the running product as one path. New features have no visible place to
belong, so the first thought of a change gets lost.

Business Value:
One owner screen shows each step of a job, what is there, the records it
writes, the roadmap and backlog work that belongs there, and a place to say
what is wrong. A later change updates that picture in the same pass.

Scope:
- Owner-only page at `/app/map`, linked from the owner sidebar as Map.
- Eight bubbles for the job path, with lines between them. Today, Desk, and
  the customer page light the bubbles they look at. They are not new steps.
- Every open backlog task is placed once, on the bubble it fits. Ideas with
  no task yet sit there too. Platform work sits under the floor.
- The canvas shows what was asked and what is in the works. Backlog and
  deferred work are toggles. The drawer always lists everything on that bubble.
- The owner can save a short request on a bubble. It stays in `map_notes`.
- Files that look unused are listed and are not deleted from that list.
- The rule for keeping the map current is `docs/working/system-map.md`.
- Admins and technicians do not see the page or the nav item.

Out of scope:
- Screenshots stored in the repo. The page links to the live screen.
- A second backlog. `docs/backlog/` stays the commitment. The map is the placement.
- Deleting unused files. Listing them is this task. Removal is a later request.
- Customer workflow changes. The map does not change how a job is done.

Acceptance Criteria:
- [ ] An owner can open `/app/map`, select each bubble and each line, and read what it is, what is there, and the records.
- [ ] Every open task in the backlog index appears once, on a real bubble, with the matching status. Finished tasks do not appear.
- [ ] Asked-for gaps sit on the step they belong to, and the drawer lists the full backlog for that step.
- [ ] A saved request stays on that bubble for the owner. An admin or technician is redirected away and has no Map nav item.
- [ ] Unit tests cover next and previous along the path, and that the backlog placement matches the index.
- [ ] The unused-file list is visible, and nothing is deleted because it is listed.

Depends on: none. Adds `map_notes` for owner requests. Does not change customer workflow.
