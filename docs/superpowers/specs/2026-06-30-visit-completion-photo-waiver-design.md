# Visit Completion Photo Waiver

**Date:** 2026-06-30  
**Status:** Draft (awaiting user review of spec)

## Problem

Currently, the CompletionChecklist for a visit strictly requires at least one photo in the completion packet (`photo_urls.length > 0`) before the "Mark Complete" button is enabled and the transition to `completed` is allowed (via `checkCompletionPacket` guard in both UI and API).

This blocks completion in legitimate cases:
- Tech forgets to take before/after photos
- Job scope does not produce visible changes that need documentation (e.g. quick lock change, minor non-visual repair)
- Client requests no photos

The separate "Before and after photos captured" item in the Closing Checklist (VisitClosingChecklist) is also a manual gate for some flows (especially repair jobs).

There is no supported way to complete without photos while still recording the reason for the exception. This leads to workarounds, blocked jobs, or incomplete records.

## Goal

Allow a technician (or owner/admin) to complete a visit without any photos by explicitly confirming "no photos" using a quick preset reason or custom "other" text.

The waiver should:
- Be as simple as the existing signature waiver (Option A)
- Provide fast, mobile-friendly quick selections + free text
- Automatically satisfy the corresponding "close_photos" checklist item
- Be clearly recorded in the completion packet and visible in the Visit Record / property history
- Still allow normal photo upload to override the waiver if the user changes their mind

## Scope

Add photo waiver support to the visit completion flow.

### In scope
- Data model extension for `completion_packets`
- Update to `checkCompletionPacket` guard
- UI in `CompletionChecklist.tsx`: quick preset chips + "Other" textarea for waiver reason
- Auto-update of the `close_photos` checklist item when waiver is used
- Display of waived reason in the "Visit Record" card
- API updates to store and return the new fields
- Basic error handling and precedence (uploaded photos override waiver)

### Out of scope
- Any additional approval workflow beyond the person editing the packet (tech or owner)
- Changes to the repair-flow `afterPhotoCount` check in `VisitTransitionForm` (separate concern based on resolution panel photos)
- Changes to property timeline, reports, or invoicing based on waived photos (record the fact, but no new flags for now)
- Mobile-specific UI tweaks beyond the existing field-first patterns
- Backfilling or migration of historical visits
- Integration with membership snapshots or other downstream consumers beyond the basic record display

## Data Model

Extend the existing `completion_packets` table (see migration 039).

Add two columns:

```sql
photos_waived boolean NOT NULL DEFAULT false,
photos_waiver_reason text
```

- `photos_waived`: true when the user explicitly confirms no photos are needed / were taken.
- `photos_waiver_reason`: the selected preset text or the free-text "other" value. Required when `photos_waived = true`.

The `photo_urls` array can be empty when waived.

Update the Zod schema in the completion-packet PATCH endpoint to accept the new fields.

Update the `CompletionPacket` interface (used by guard and UI).

The existing `signature_waiver` pattern is the model.

## Guard Logic

Update `lib/completion-guard.ts`:

```ts
export interface CompletionPacket {
  photo_urls: string[];
  signature_url: string | null;
  signature_waiver: boolean;
  photos_waived?: boolean;
  photos_waiver_reason?: string | null;
}

export function checkCompletionPacket(packet: CompletionPacket | null) {
  if (!packet || (packet.photo_urls.length === 0 && !packet.photos_waived)) {
    return { ok: false, error: "MISSING_PHOTO" };
  }
  if (!packet.signature_url && !packet.signature_waiver) {
    return { ok: false, error: "MISSING_SIGNATURE" };
  }
  return { ok: true };
}
```

The transition route already calls this guard for `completed` status, so it will automatically allow waived cases (update the error message text if desired for clarity).

## UI – CompletionChecklist

Location: `apps/web/app/app/visits/[id]/CompletionChecklist.tsx`

Current photos section:
- Upload button + URL add
- Grid of uploaded photos with remove
- Summary count in the dl

New behavior when 0 photos:

Add below the upload controls (or as an alternative path):

```
No photos needed?

[Forgot to take photos] [Not needed for this job] [Client didn't want photos] [Other]
```

- Presets are large touch-friendly buttons/chips.
- Clicking a preset sets `photos_waived = true` and the reason.
- "Other" reveals a textarea for custom reason.
- Selected state shows the reason with "Clear" or "Change".
- If user uploads a photo while waiver is active, clear the waiver (photos take precedence).
- The dl row updates to show "Photos: waived — <reason>" when active.

On "Save Packet":
- If waived, send `photo_urls: []` (or current if any), `photos_waived: true`, `photos_waiver_reason`.

The "Mark Complete" button respects the updated guard (enabled when other requirements are met).

## Auto-satisfy Closing Checklist

When the packet is saved with `photos_waived = true`:

- In `CompletionChecklist`, after successful packet save, locate the checklist item with `item_key === "close_photos"`.
- PATCH it to `disposition: "ok"` if it is not already.

This fulfills the user's request that waiving photos also satisfies the "Before and after photos captured" step.

The `VisitClosingChecklist` will reflect the updated state on refresh.

## Display – Visit Record

Location: `apps/web/app/app/visits/[id]/page.tsx` (the "Visit Record" card shown after completion).

Update the photo summary logic:

- If `photos_waived`: show "Photos waived: {photos_waiver_reason}" (muted styling, similar to signature waiver).
- Else if `photo_urls.length > 0`: show count (existing).
- Else: fall back to the existing "No completion notes or photos recorded" only when truly nothing.

The waiver reason becomes part of the permanent visit record.

## Error Messages & Copy

- Guard error `MISSING_PHOTO` message remains or is slightly softened: "At least one photo is required (or confirm no photos needed)".
- In the UI, the waiver section provides clear guidance.
- "Client signature waived" pattern is the model for copy.

## Permissions

Follows existing `canUpdate` / `canComplete` / `canNotes` flags on the visit (tech on assigned visit, or owner/admin). Same as current signature waiver.

No new role checks.

## Edge Cases

- User can switch from waiver back to upload at any time before save (clears waiver).
- If photos exist and user tries to waive: uploads win; waiver UI is secondary or disabled while photos present.
- Reason is always captured when `photos_waived = true`.
- Waiver reason is shown even if the visit was completed with 0 photos.
- Existing completed visits are unaffected.
- The repair-flow `afterPhotoCount` check in `VisitTransitionForm` is out of scope for this change (it uses resolution panel photos).

## Success Criteria

- Tech can select a preset (or Other + type) → save packet with waiver → "Mark Complete" becomes enabled.
- The close_photos checklist item is automatically checked when waiver is used.
- Visit Record shows the waiver reason clearly.
- Normal photo upload path remains unchanged and takes precedence.
- No extra approval step required (per Option A).
- Works for both in_progress completion and any other path that uses the packet guard.

## Out of Scope

- Changes to how after/before photos in the Resolution panel affect repair flow blockers.
- New backend approval workflow.
- Updates to reporting, invoices, or property timeline to specially flag waived visits (the fact is recorded in the packet).
- Preset customization per job type or user.
- Backfills or data migration for old visits.

## Implementation Notes (for later plan)

- New migration for the two columns on `completion_packets`.
- Update completion packet PATCH API + Zod.
- Extend `CompletionPacket` interface and queries.
- Modify guard function + tests.
- Add waiver UI state + preset chips in CompletionChecklist.
- Auto-patch logic for the close_photos checklist item.
- Update Visit Record display logic.
- Update any packet loading / display components.
- Add/update unit tests for guard with new waiver case.
- Consider e2e test for the waiver flow.

This keeps the change small, consistent with existing waiver patterns, and directly solves the stated need.