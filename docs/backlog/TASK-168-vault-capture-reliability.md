# TASK-168: Reliable vault capture

Status: In progress
Phase: 2
Epic: EPIC-003 Property Intelligence

Fix staff entry without making manual inventory a prerequisite for customer records.

Acceptance Criteria:
- [ ] Add/edit fields retain focus through individual keystrokes.
- [ ] Saving edits preserves photo counts.
- [ ] Deleting an item requires confirmation naming its photos; cancel preserves the item.
- [ ] Category coverage is labelled honestly.

Delivery: independent repair alongside TASK-164; a browser regression covers typing and canceling deletion.

Progress (2026-10-06, with TASK-175):
- [x] Form hoisted to module level; typing retains focus (verified in browser).
- [x] Edit save keeps the photo count.
- [x] Delete asks for confirmation naming the photo count; cancel keeps the item.
- [x] Coverage reads "Categories recorded — N of 6 have at least one item".
- [x] Dates normalized to calendar days, so the edit form no longer receives timestamps (which would blank and then wipe them on save).
- [ ] Automated browser regression for typing and delete-cancel — not added yet (test gap).
