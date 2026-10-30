# TASK-223: One authoritative estimate draft for prepared quotes

Status:
In Progress (PR 1 of 2)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
A quote built by Prepare Quote can be priced in more than one place. Prepared
Scope edits reach the quote lines only on Apply, so the two can disagree with
nothing warning before Send. The edit form edits the generated lines (Apply
then overwrites them) and can switch the quote to painting or fixed-bid
pricing, after which Apply adds the prepared lines on top: a double charge.
Line replacement deletes every line, so Apply wipes a multi-option quote's
option lines. Itemized materials (TASK-187) were written in a shape that
crashes the print and shopping-list pages.

Business Value:
One place to change a prepared quote, a customer quote that always matches it,
and no duplicate or lost charges.

Scope:
PR 1, critical fixes:
- Itemized materials are written as the standard shopping list (specified
  items per work area); the print page tolerates a section without either list.
- Line replacement keeps option lines unless the same save rewrites options.
- A prepared quote refuses painting and fixed-bid pricing (422
  PREPARED_SCOPE_PRICING); the edit form hides those switches on it. Manual
  quotes are unchanged.

PR 2, single source:
- One Save updates Prepared Scope and regenerates its quote lines in one
  transaction.
- Prepared lines are read-only in the edit form and protected on the server;
  manual lines, travel, notes and options are kept.
- AI revisions never replace owner-set hours or material prices.
- Send is blocked while the prepared scope and the quote lines disagree.
- Customer PDF and portal: no internal itemized materials; T&M labor shown as
  work-area hours x rate.
- Playwright regression test in CI.

Out of Scope:
Pricing engine and materials feature changes.

Acceptance Criteria:
- [ ] PR 1: itemized quote prints; Apply keeps option lines; painting and
      fixed-bid saves are refused on a prepared quote and nothing doubles;
      manual quotes switch modes as before. (Integration tests.)
- [ ] PR 2: full estimating workflow regression tests pass before deploy.

Related:
TASK-187, TASK-200 (multi-option totals), TASK-202 (prepared quote edge cases).
