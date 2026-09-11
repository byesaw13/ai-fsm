# Expense photo ↔ CSV duplicate merge

Date: 2026-09-10  
Status: approved (hybrid matcher)

## Goal

One store trip is one expense, whether it arrived as a Home Depot/Lowe's CSV row or a photographed receipt. Keep a single row and attach the photo to it.

## Matcher (hybrid)

Shared pure helper. Candidate vs existing expenses, same account.

1. **Transaction ID** — if both sides have a normalized id (alnum, case-insensitive) and they match, that is the trip. If both have ids and they differ, it is not a match even when dollars line up.
2. **Else store family + calendar date + amount** — Home Depot / Lowe's names collapse to a family (`HOME DEPOT #3408` = `The Home Depot`). Amounts match if equal within 3¢, or if the larger is the smaller plus 0% or 6.25% MA tax (3¢).
3. **Ambiguous** (two existing rows both fit) → do not merge.

## Behavior

- **CSV preview:** "Already imported" includes photo expenses the matcher hits, not only prior CSV refs.
- **CSV commit:** no second insert. Stamp `source` + `external_ref` on the existing row when those are empty. SKUs still update the catalog. Do not overwrite a photo amount with the CSV (pre-tax) total.
- **Photo save:** `POST /api/v1/expenses` returns the existing id (`merged: true`) instead of inserting. Receipt upload then lands on that row.
- **Receipt upload:** if the row already has a photo, keep the first.
- **OCR:** parse `transaction_id` when printed; use it when present.

## Out of scope

Backfill-merge of duplicates already in the database. Two real same-day same-dollar trips at the same store without transaction ids may collapse.
