# TASK-218: Craftsman reference hours and parts beside the price book

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (estimating assistant slice; see ROADMAP Phase 3 bullet "TASK-218 Craftsman reference hours")

Owner approval:
Required before build. It adds one column to `price_book`, so it needs a table-freeze exception.

Depends on:
None to start. Reads better once TASK-191 (hours on every estimate) lands, but does not need it.

Problem:
When the owner sets or questions the hours on a price book code, there is no outside number to check
against. The owner's Craftsman National Estimator Cloud subscription has repair-work hours for most of our
codes. It also lists what each job includes and the minimum charge per trade. All of that is in a
working sheet (`docs/working/craftsman-reference-pricebook.md`), not in the app. Ten active codes have
no hours at all (4005, 4011, 4012, 4013, 5002, 5012, 9010 to 9013). Craftsman has clean rates for six
of them (4011, 4013, 5002, 9010, 9011, 9013).

Scope:
- **Migration (additive, reversible):** `price_book.reference_hours jsonb not null default '[]'`. Each
  entry is one cited Craftsman line:
  - source (`craftsman`), book, edition, line label, captured date
  - unit (`Ea`, `LF`, `SF`, `SY`, `step`)
  - install hours per unit; optional remove hours per unit; optional reset hours
  - optional per-trade minimum hours
  - what the line includes (short text)
  - owner note

  A down migration drops the column. RLS is unchanged: `price_book` is already a reference table
  (migration 184).
- **Domain:** a Zod schema and type for one entry in `packages/domain`. Add a pure helper that returns
  the swap hours (install + remove) for a given quantity, and also returns the minimum when one is set.
- **Load:** an owner-run script, `pnpm --filter @ai-fsm/web ref-hours:load <csv>`. It reads an
  owner-reviewed CSV kept outside git (`~/craftsman-reference/approved.csv` on garonhome).
  - It validates every row against the schema and checks the price book code exists.
  - It replaces that code's entries in one transaction.
  - It prints a before/after diff, and writes only with `--apply`.
  - The licensed numbers never enter the repo. Test fixtures use made-up values.
- **Price book page** (`apps/web/app/app/price-book`): a "Reference (Craftsman)" block under each code.
  - It shows each cited line: book, line, hours per unit, swap hours, includes, minimum.
  - Next to it, our low / typical / high hours.
  - It is labelled "Reference only. Your hours are used on quotes."
- **API:** `GET /api/v1/price-book` returns `reference_hours`. There is no write route; the script is the
  only writer.

Out of scope:
- Using reference hours anywhere in price, line hours, the hourly baseline (TASK-188 to TASK-195),
  confidence (TASK-213) or AI prompts. They are display only.
- A button that copies Craftsman hours into our hours. The owner edits our hours by hand, as today.
- Bulk or catalog import of Craftsman books. Any Craftsman line not tied to a Dovetails code stays out.
  The ROADMAP Phase 4 deferral of licensed volume import stands.
- Estimate-line display of reference hours (possible follow-up once TASK-191 ships).
- Parts lists into `service_materials`. The "includes" text is shown; turning it into material rules is
  separate work.

Acceptance Criteria:
- [ ] Migration adds `price_book.reference_hours` with default `[]`; down migration removes it; RLS
      coverage guard still passes.
- [ ] Domain schema rejects an entry with no book, line label, unit or install hours, and rejects
      negative hours.
- [ ] Swap helper unit tests: install only; install + remove; quantity scaling (per LF/SF); minimum
      applied when the total is below it.
- [ ] Load script, without `--apply`, writes nothing and prints the diff. With `--apply`, it replaces
      only the codes in the CSV. An unknown code or invalid row fails the whole run.
- [ ] Price book page shows the reference block for a code that has entries, and nothing for a code
      without them.
- [ ] Test proves estimate creation, Prepare Quote and the hourly baseline give identical results with
      and without `reference_hours` set (reference never feeds pricing or hours).
- [ ] No Craftsman figures in committed files outside `docs/working/craftsman-reference-pricebook.md`.
      Test fixtures are made up.
- [ ] Owner loads the reviewed CSV on prod and spot-checks five codes on the price book page.

Design notes:
- A column, not a new table: one owner, read-only display, a few entries per code. This keeps it to
  the smallest schema change the table freeze allows. If later work needs to query across entries, move
  them to a table then.
- Hours meaning follows the working sheet: worker-hours per unit; swap = install + remove; no travel or
  setup. The block says so in one line.

Source:
`docs/working/craftsman-reference-pricebook.md` (2026-10-27).

Effort:
1 d / 2 h
