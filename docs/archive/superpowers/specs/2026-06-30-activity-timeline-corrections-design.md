# Activity Timeline Corrections And Job Linking Design

## Context

The activity timeline has two sources of time:

- Manual activity rows chosen by the user.
- Auto-captured location records from MQTT/Home Assistant, reduced into stops, drives, and detected visit candidates.

The automated system is becoming trusted enough to use more often, but today it is too slow to confirm when its time range overlaps a manual row. The current flow blocks confirmation with an overlap error and forces the user to leave the detected record, find and dismiss or edit the manual row, then come back and confirm the auto record.

Stops and drives also need a way to attach to jobs so billing and profit margin reporting can include the operational reality of travel, material runs, and site time.

## Goals

- Let the user confirm a trusted auto record even when it overlaps a manual row.
- Prevent double-counted time.
- Keep a transparent archive of changed originals for taxes, reporting, and trust.
- Let auto stops and drives attach to jobs when the system has a good suggestion.
- Allow confirmation without a job when the job is unknown, then surface the activity for later cleanup.
- Keep the normal timeline clean and fast to use.

## Non-Goals

- Do not create a second activity archive table.
- Do not require every stop or drive to be perfectly classified before confirmation.
- Do not show archived originals inline in the normal daily timeline.
- Do not make travel or material runs billable by default.

## Correction Flow

When an auto-captured stop, drive, or detected visit overlaps an existing manual activity, the system shows a confirmation dialog instead of hard-failing.

The dialog shows:

- The auto record being confirmed.
- The overlapping manual record.
- The proposed replacement or trim.
- The suggested job link, when available.
- A note that the original manual record will be archived for audit/report transparency.

On confirm, the system writes the auto activity as the active ledger row and removes or trims the overlapping manual row so time is not double counted.

The original manual row is preserved through the existing `audit_log` pattern. The archive records who made the change, when it happened, the original activity fields, the replacement activity fields, and the reason/source of the correction.

Archived originals are not shown in the normal timeline. They should be available through audit/report/export surfaces.

## Job Linking

Auto confirmation should support a job link, but the link is optional.

When a detected customer stop, visit candidate, or matched property already points to a likely job or visit, the confirmation dialog preselects that suggestion. The user can accept it, change it, or confirm without a job.

If the user confirms without a job, the activity remains valid time but is marked for later cleanup through a small "Needs job link" review bucket.

The review bucket should include confirmed activities that matter to job costing but have no business link, especially:

- `job_work`
- `travel`
- `material_run`
- other field activities that may affect job margin

## Billing And Profit Rules

`activity_entries` remains the time ledger.

Billing and margin behavior:

- Linked `job_work` counts as billable tracked labor when attached to the job/visit path used by invoice labor.
- Linked `travel`, `material_run`, and similar activities count as job overhead by default.
- Non-`job_work` activities can be manually marked billable later when needed.
- Activities without a job link do not affect job billing or margin until linked.

This keeps daily confirmation fast while preserving accurate cleanup for invoices and margin reporting.

## Backend Shape

Reuse the existing timeline rebalance and audit behavior instead of adding a new archive system.

The segment and visit-candidate confirmation routes should accept an explicit rebalance/replace confirmation from the client. Inside one transaction they should:

1. Lock the auto source row.
2. Lock or validate overlapping activity rows.
3. Insert the confirmed auto activity.
4. Apply the accepted rebalance/delete adjustments to overlapping manual rows.
5. Append audit records for changed originals.
6. Mark the source segment/candidate confirmed and link it to the new activity.

If no accepted rebalance/replace payload is provided, the routes should keep rejecting overlaps. That preserves the safety guard for callers that have not shown the user the confirmation dialog.

## UI Shape

The timeline page should reuse the existing "adjust timeline" confirmation pattern used by manual edits.

For auto confirmations:

- Detect overlap response from the API or precompute overlap from the loaded timeline rows.
- Show a confirmation dialog with the auto record and affected manual row summary.
- Include the job suggestion selector when a suggestion exists.
- Allow "Confirm without job".
- After confirmation, refresh the timeline, captured locations, detected visits, and map.

The normal daily timeline should show only active ledger rows. Archived originals stay out of the main timeline.

## Testing

Add focused tests for the behavior with the smallest useful coverage:

- Confirming an overlapping auto segment with an accepted replace/archive operation creates one active auto activity and does not double count the manual time.
- The replaced or trimmed manual activity is represented in `audit_log`.
- Confirming a suggested job/visit link writes the correct `entity_type` and `entity_id`.
- Confirming without a job leaves the activity discoverable by the "Needs job link" query.
- Billing includes linked `job_work` as labor and treats linked travel/material time as overhead unless manually marked billable.

## Open Implementation Notes

- The existing `audit_log` table is the archive source unless implementation finds a hard reporting gap.
- The first implementation can keep archive visibility export/report-only.
- If a future tax/report workflow needs richer archive browsing, add a read surface over `audit_log`; do not duplicate archived activity rows.
