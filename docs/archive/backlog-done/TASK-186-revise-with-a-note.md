# TASK-186: Revise the prepared quote with a note

Status:
Done (2026-10-25)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
Answers to the prepared quote's questions were stored and nothing used them:
a real draft kept a "paint the pantry cabinets" task (about $300) after the
owner answered "No". There was no way to say "that labor seems high, keep the
subfloor allowance, show vinyl against LVP" and have the quote change.

Business Value:
The owner corrects the draft the way they would talk to a helper, sees what
changed and why, and keeps or discards it.

Scope:
- Revise box on Prepared Scope: open questions with answer fields and a note.
  Revise saves the answers and edits first, then the model returns only
  changes (update, add, exclude, include) with a reason each, plus new options.
- Code applies the changes: unknown task ids are skipped, ruled-out work is
  excluded (never deleted), added work is built like prepared work (rooms,
  quantities, wall pace, computed paint), revised hours are labeled "revised
  from your note", and no-op changes are dropped.
- The proposal is shown with before and after values and the total before and
  after. Keep re-applies the same changes to the saved scope and logs the note;
  Discard leaves the saved scope as it was. Quote lines still change only on Apply.

Acceptance Criteria:
- [x] Answering "No" to a question and pressing Revise proposes taking that task out.
- [x] A note can change hours or materials, add work, or add an option pair.
- [x] Nothing is saved to the scope until Keep; answers are saved either way.
- [x] Each change shows its reason and the new total.
- [x] When the model is unavailable, the owner is told and nothing typed is lost.

Notes:
Not yet run against the live model: the local development key has no API
credit. First live check: Revise on a draft after deploy (without approving it).
