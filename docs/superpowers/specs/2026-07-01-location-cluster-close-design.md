# Location Cluster Close — Design Spec
**Date:** 2026-07-01  
**Status:** Approved  
**Backlog tasks addressed:** TASK-024, TASK-025, TASK-026, TASK-027, TASK-046 (remainder), TASK-049 (partial)

---

## Goal

Close the location cluster by making the full-day experience work end-to-end: you leave home, work all day, return home, and the whole day is captured and reviewable with minimal gaps. The system guides you through a smart end-of-day review and closes the day cleanly.

---

## System Flow

### 1. Start of Day — RAM Bluetooth Connect

When the HA Companion detects a connection to the RAM's Bluetooth (`Uconnect` / `00:22:A0:A6:49:0D`), an HA automation POSTs to `POST /api/internal/start-day-prompt`. FSM responds with the appropriate signal; HA sends a Companion push notification:

> *"Ready to start your day?"*

Options:
- **Start Day** — deep link opens the app to the existing Start Day flow (odometer, vehicle selection)
- **Day Off** — FSM marks the business day as non-working; location capture stays off for the day
- **Personal / Errand** — dismisses without opening a business day; no tracking

The prompt is suppressed if a business day is already open, or if it's a weekend and `suppress_weekend_start_prompt` is enabled.

Only the RAM triggers this prompt. The GMC is not included in v1.

### 2. Passive Capture During the Day

No change to the existing pipeline. The HA Companion streams location events to FSM via the existing ingest endpoint. The segment reducer produces stop/drive segments. False drives are filtered (TASK-040). Visit candidates are created from qualifying stops (TASK-043). The owner can confirm segments in real time or leave them for end-of-day review.

### 3. End of Day — Home Zone Arrival, Time-Gated

When the HA Companion detects arrival at the home zone, an HA automation fires — but only if both conditions pass:
1. Current time is at or after the configured cutoff (default **5:00 PM**)
2. An open business day exists in FSM

FSM checks these conditions server-side on `POST /api/internal/day-review-prompt`. If they pass, FSM sets `business_days.review_prompted_at`. HA sends a Companion push notification with a deep link to `/app/day-review`. A badge also appears on the app nav and persists until Close Day is tapped.

Midday returns (supply runs, lunch, tools) pass through silently because the time condition fails.

### 4. Day Review Surface (`/app/day-review`)

A smart summary page with three collapsible sections. High-confidence items come pre-selected for bulk confirm. A **Confirm All** banner at the top bulk-confirms everything pre-filled in one tap. Individual cards can still be overridden after bulk confirm.

#### Visits
Each pending `visit_candidate` as a card: property name, time range, duration, confidence badge. Candidates at or above the confidence threshold are pre-selected. One-tap classify buttons: Job Work / Estimate / Warranty / Material Drop / Ignore. Tied matches (two properties at similar confidence) surface both cards — no auto-selection.

#### Time
Compact timeline of the day's segments. Confirmed segments shown in grey. Unconfirmed stops and drives shown with a classify prompt. Drive segments confirm as `travel` activity (per the TASK-027 hybrid decision). Gaps in coverage longer than the minimum dwell time surface as named gap cards ("2h 15min untracked — personal time?") — owner dismisses or labels. Gaps are not invisible whitespace.

#### Mileage
Shows the Start Day vehicle session (odometer-based, source of truth) alongside GPS-estimated trip totals from drive segments. These are for comparison only — the odometer number is what counts. If the delta exceeds 20%, a warning flag surfaces. The flag does not block Close Day but stays visible until dismissed.

### 5. Close Day

A **Close Day** button sits at the bottom of the review surface, always visible. If unaddressed flags remain, the button shows a warning count ("3 items still flagged") but does not block — field reality wins.

Tapping Close Day stamps `business_days.closed_at`.

After close, the button becomes **"Day Closed — tap to reopen"**. Reopening keeps `closed_at` as a record of when the day was first closed. Any `activity_entries` created or modified after `closed_at` are stamped `revised_after_close: true`. The voided entry + the new stamped entry is the complete audit trail — no separate audit log table needed.

### 6. Follow-Up Reminder (optional)

If `close_day_followup_hours` is configured and `closed_at` is still null after that many hours, HA fires a second Companion notification. FSM's endpoint is idempotent so a race between the reminder and a manual close is harmless.

---

## Database Changes

### `business_days`
Two new columns:
- `review_prompted_at TIMESTAMPTZ` — when the HA trigger fired
- `closed_at TIMESTAMPTZ` — when the owner tapped Close Day

### `activity_entries`
One new column:
- `revised_after_close BOOLEAN NOT NULL DEFAULT FALSE` — set when an entry is created/modified after its business day's `closed_at`

### `accounts` (settings)
Seven new columns with defaults:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `day_review_cutoff_time` | `TIME` | `17:00` | End-of-day trigger cutoff |
| `min_stop_dwell_minutes` | `INTEGER` | `5` | Minimum stop duration for candidate creation |
| `visit_confidence_threshold` | `INTEGER` | `70` | Confidence floor for "Confirm All" pre-selection |
| `location_retention_days` | `INTEGER` | `60` | Raw GPS breadcrumb retention (already reserved in TASK-046) |
| `suppress_weekend_start_prompt` | `BOOLEAN` | `FALSE` | Skip RAM BT start-day prompt on weekends |
| `close_day_followup_hours` | `INTEGER` | `NULL` | Hours before follow-up reminder fires (null = off) |
| `tracking_start_time` | `TIME` | `NULL` | Hard start of tracking window (null = no restriction) |
| `tracking_end_time` | `TIME` | `NULL` | Hard end of tracking window (null = no restriction) |

---

## New Endpoints

### `POST /api/internal/start-day-prompt`
Called by HA on RAM BT connect. Auth: internal key (same pattern as existing ingest). Returns one of: `start` (show prompt), `suppress_weekend`, `already_started`, `no_action`. HA maps the response to the appropriate notification or silence.

### `POST /api/internal/day-review-prompt`
Called by HA on home zone arrival. Auth: internal key. Server-side checks: open business day exists, current time ≥ `day_review_cutoff_time`. Sets `review_prompted_at` if checks pass (idempotent). Returns `prompted` or `skipped` with reason.

### `GET /api/v1/day-review/[date]`
Returns the structured three-section review payload: visits (pending candidates with match info), time (segments + activity_entries + computed gaps), mileage (vehicle session + GPS drive totals + delta flag).

### `POST /api/v1/day-review/close`
Stamps `business_days.closed_at` for the given date. Idempotent.

---

## Settings UI

A new **Location & Day** section in the existing Settings page exposes all eight knobs with their defaults. No separate settings page needed — it slots into the existing settings surface.

---

## HA Side

Two HA automations (documented in `docs/working/ha-location-capture.yaml`):

1. **RAM BT connect** → `POST /api/internal/start-day-prompt` → Companion notification with action buttons
2. **Home zone arrival** → `POST /api/internal/day-review-prompt` → Companion notification with deep link (only fires if FSM responds `prompted`)

No new HA sensors or zones required. The home zone and RAM BT sensor (`sensor.<phone>_bluetooth_connection`) are already configured.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Home arrival but no open business day | FSM returns early, no badge set |
| Home arrival after cutoff but day already closed | Idempotent, no re-prompt |
| RAM BT connect on weekend, suppress enabled | FSM signals HA to skip notification |
| RAM BT connect with day already open | FSM returns `already_started`, HA stays silent |
| No segments captured (Companion not running) | Each section shows empty state; Close Day still available |
| Two visit candidates tied in confidence | Both surface as separate cards; owner picks |
| Gap > 30 min in coverage | Named gap card, owner dismisses or labels |
| Mileage delta > 20% | Warning flag, does not block Close Day |
| Close Day with unaddressed flags | Warning count shown, Close Day not blocked |
| Follow-up reminder fires after manual close | Idempotent endpoint returns `skipped` |

---

## Testing

### Unit tests (`packages/domain`)
- **Gap detector** — given segments + activity_entries, returns gaps over threshold with correct duration
- **Confidence pre-selector** — given candidates with scores + account threshold, returns correct pre-selected set
- **Mileage delta checker** — given odometer total + GPS total, returns flag + percentage when over 20%

Each tested against a handful of representative real-data scenarios.

### Integration tests
- `POST /api/internal/day-review-prompt` — four guards: no open day, already closed, before cutoff, happy path
- `POST /api/internal/start-day-prompt` — weekend suppress, already started, normal
- `GET /api/v1/day-review/[date]` — correct three-section assembly from seeded data
- `POST /api/v1/day-review/close` — stamps `closed_at`; subsequent `activity_entries` insert gets `revised_after_close: true`

### E2E
- Happy path: open review surface → Confirm All → Close Day → badge clears
- Post-close edit: reopen → make a change → verify `revised_after_close: true` on the new entry

---

## Out of Scope

- GMC BT start-day prompt (v1 RAM only; add GMC when RAM proves out)
- Native app / Capacitor for first-party geofencing (HA Companion is sufficient)
- GPS mileage as the source of truth (odometer remains truth; GPS is sanity check only)
- Multi-employee tracking
- Per-property geofence radius in settings (each property can hold its own radius; no global override needed)
- Day Map (`/app/timeline` Leaflet view) — TASK-026, separate deliverable that builds on the same data
