# TASK-129: One daily home leftover fold — Needs attention + today's timeline on My Day

Status:
Done

Phase:
0

Problem:
A1 leftover after TASK-124 (naming) and TASK-038 (landing). Overview still
merged Start Day / Daily Workflow into the office dashboard; `/app/action-queue`
was an orphan; today's activity lived only on Tracking.

Business Value:
From the phone, the day is one screen (My Day) plus evening Day Review.
Needs-attention and today's blocks are on that screen, not competing homes.

Scope:
- My Day (`/app/my-work`) hosts the owner **Needs attention** list (the old
  action-queue) and a **Today so far** strip from `activity_entries`.
- `/app/action-queue` redirects to My Day `#attention`. Deep links and promise
  resolve keep working.
- Overview strips Start Day / Daily Workflow / field-day merge; CTA "Go to My Day".
- Keep Day Review and Tracking (`/app/timeline`) as their own jobs (close /
  reconstruct). No schema change.

Out of Scope:
- TASK-074/075 next-action / inline complete.
- Deleting routes (redirect and demote only).

Acceptance Criteria:
- [x] Owner My Day shows Needs attention and today's activity blocks.
- [x] `/app/action-queue` redirects to My Day.
- [x] Overview no longer hosts Start Day / Daily Workflow.

