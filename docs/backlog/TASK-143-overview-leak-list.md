# TASK-143: Overview is the leak list

Status:
In Progress

Phase:
1

Problem:
`/app` is a second command center. It duplicates today’s jobs (read-only),
builds its own task queue, and never shows the leak list My Day already has
(finished no invoice, open no next visit, unlinked receipts, untagged miles).
Three “start here” widgets compete.

Business Value:
Office home = what is leaking. Empty means stop. Field stays on My Day.

Scope:
- One attention source: `loadNeedsAttention` (same as My Day).
- Drop AttentionCard, duplicate WhatNext, read-only Today’s Projects, Quick
  Actions grid, expenses $ hero, Materials panel.
- Keep: My Day + New request in the header, money rail (collected / outstanding),
  tomorrow’s plan.
- Keep `OWNER_QUICK_ACTIONS` for command search; do not render the icon grid.

Out of Scope:
- Merging Overview into My Day
- Charts
- Changing My Day

Acceptance Criteria:
- [ ] `/app` leak list matches My Day Needs Attention items
- [ ] No read-only Today’s Projects; Complete is not offered here
- [ ] Empty leak list copy: nothing leaking
- [ ] Tomorrow and money rail remain
