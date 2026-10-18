# System map

The owner map at `/app/map` is the picture of the product. It is how a change is requested, and how a later change stays visible.

The job path is eight bubbles: Request, Person, House, Quote, Job, Visit, Bill, House history. Today, Desk, and the customer page are ways of looking at those bubbles. Platform work sits under the floor, not on the path.

## What a change must update

The same change that adds, moves, finishes, or drops a backlog task updates `apps/web/app/app/map/work-items.json`.

- One open task, one bubble. The unit test fails if an open task in `docs/backlog/README.md` is missing, duplicated, or marked with the wrong status.
- `Proposed` and `Ready` are backlog. `In progress` is in the works. `Deferred` stays deferred. `Done` and `Cancelled` come off the map.
- The `fit` sentence says why that task sits on that bubble, in the owner's words.
- A new idea that has no task yet is an `asked` or `idea` row on the bubble it belongs to. It is not a second backlog. Promote it to a task in `docs/backlog/` before building it.

The same change that changes what a step does updates that bubble's "there" text in `apps/web/app/app/map/map-data.ts`. Leave the other bubbles alone.

A sentence the owner saves on a bubble is a row in `map_notes`. Read the notes on a bubble before changing that step. The note is a request. It is not a task until it is promoted.

## Unused code

Do not delete a source file because it looks unused.

1. Run `node scripts/map-unlinked.mjs` when the change is about removing files.
2. The file has to appear on the map, under Seen, not removed.
3. Remove it only in a later change, after the owner asks.

Pages, API routes, layouts, and the worker entry are not unused just because nothing imports them.

## What the page shows

The canvas keeps the eight bubbles readable. Things you asked for, ideas, and work in progress are drawn on the step. The backlog and deferred work are toggles. The drawer of a bubble always lists every item on that bubble, whatever the toggles say. Four satellites show on the canvas. The rest are "more on this step" and are still in the drawer.

Requests save for the owner only, after migration `203_map_notes.sql`. Until that migration is applied, the picture still renders and the save button stays off.
