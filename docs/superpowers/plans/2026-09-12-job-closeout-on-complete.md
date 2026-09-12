# TASK-133 Job closeout on Complete — implementation plan

**Spec:** `docs/superpowers/specs/2026-09-12-job-closeout-on-complete-design.md`  
**Status:** Waiting on owner approval. Do not build until TASK-133 is Ready.

## Build order after approval

1. TASK-134 — Complete fork (API + all Complete entry points)
2. TASK-135 and TASK-136 in parallel (return packet vs done invoice)
3. TASK-137 — briefing card (reads 135 data)
4. TASK-138 — night leftovers
5. One PR per task (or 134+135 then 136 then 137+138). Each must have tests.
6. Merge and `scripts/deploy.sh` after CI green.

## Do not

- New tables for handoff / work log / engagement
- SKU-itemize or handling fee on this invoice path
- Auto-complete the WO on “coming back”
- Close the business day on visit Complete
- Start code on this plan before the owner marks TASK-133 Ready
