# In-app attention notifications — Design

**Date:** 2026-08-04  
**Status:** Approved (brainstorm)  
**Product:** Dovetails FSM (`ai-fsm`)  
**Approach:** Attention layer (1) — live queue badges + append-only activity events; in-app only for v1

---

## Problem

The owner runs the business from the app but has no persistent “something needs you” signal in chrome. New booking requests, invoices waiting to be finished or opened by the client, and moment-of-truth events (invoice opened, estimate approved, payment) only surface if you already open the right list. Existing pieces are partial: invoice list “Not opened” badges, Day Review red dot, Overview metric cards — nothing unifies them into nav bubbles + a short activity feed.

## Goals

1. **Queue badges** on Requests and Invoices so open work is visible from the shell.
2. **Activity events** for common client/system moments (request created, estimate opened/approved/declined, invoice opened/paid/partial).
3. **Bell + Overview** so events are findable without hunting.
4. **Hybrid clear rules:** queues reflect real work; events clear on mark-read or opening the linked record.
5. **Owner + admin only** in v1; techs unchanged.
6. **In-app only** for v1; shape data so email/push can subscribe later without redesign.

## Non-goals (v1)

- Push notifications, SMS, or email digests.
- Per-user notification preferences matrix.
- Tech / field assignment notifications.
- Queue badges for Estimates, Jobs, Work Orders (beyond existing Day Review affordance).
- WebSockets / realtime infrastructure.
- Multi-tenant “inbox product” or third-party notification services.
- Replacing invoice list unread chips or Overview money metrics (they stay; attention layer complements them).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Shape | Queue counters **and** activity events |
| Audience | Owner + admin |
| Queue surfaces | Requests, Invoices |
| Activity types | All of: invoice opened/paid/partial, estimate opened/approved/declined, booking request created |
| UI | Bell (global) + Overview Attention block + nav count bubbles |
| Clear rules | Hybrid: queues = live filters; events = mark-read / open record |
| Channels | In-app now; push/email later |
| Implementation approach | **Attention layer** — live SQL counts + `attention_events` table; poll summary |
| Event retention | **Last 90 days** (prune older) |
| Read model | Account-level feed (shared mark-read for owner/admin) |
| Freshness | Poll ~45–60s while tab visible + on navigation |

---

## Two systems (do not collapse)

| | Queue badges | Activity events |
|---|---|---|
| Question | How much work is waiting? | What just happened? |
| Source | Live SQL counts | Append-only `attention_events` |
| Clears when | Item no longer matches filter | `read_at` set (mark one / all / open link) |
| Examples | Requests **3**, Invoices **2** | “INV-0029 opened”, “Estimate approved” |

---

## Queue badge rules

Badges are **honest counts**. Zero → hide the bubble. Cap display at **99+**.

### Requests (`/app/requests`)

Count booking requests in the **open funnel** (aligned with default Requests list):

```text
status IN ('pending', 'needs_info', 'reviewed', 'assessment_booked', 'estimated')
```

Terminal statuses (`converted`, `lost`, `cancelled`, `duplicate`) do not count.

### Invoices (`/app/invoices`)

Count **distinct** invoices matching any of:

1. `status = 'draft'` AND `invoice_kind IN ('final', 'standard')` — finish / send  
2. `status = 'overdue'` — collect  
3. `status IN ('sent', 'partial')` AND `first_viewed_at IS NULL` AND not void — sent, client has not opened portal  

**Exclude** pure deposit-kind drafts from rule (1) so the badge stays about commercial invoices, not every deposit prep. Overdue deposits may still match rule (2) if status is overdue.

Optional later: `?attention=1` filter on the invoices list; not required for v1 if default list already surfaces these rows.

---

## Activity events

### Types (v1)

| `type` | When emitted | `href` target |
|---|---|---|
| `booking_request.created` | Booking request inserted | `/app/requests/{id}` |
| `estimate.opened` | Client **first** portal open on estimate | `/app/estimates/{id}` |
| `estimate.approved` | Estimate status → approved | `/app/estimates/{id}` |
| `estimate.declined` | Estimate status → declined | `/app/estimates/{id}` |
| `invoice.opened` | Client **first** portal open (existing view stamp path) | `/app/invoices/{id}` |
| `invoice.paid` | Invoice becomes fully paid | `/app/invoices/{id}` |
| `invoice.partial` | Invoice becomes partially paid | `/app/invoices/{id}` |

**Idempotency:** use `dedupe_key` unique per account (e.g. `invoice.opened:{invoice_id}`) so double stamps or retries do not create multiple unread rows for the same first-open. Subsequent portal opens update invoice view counters only; they do not create new unread `*.opened` events.

### Table: `attention_events`

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `account_id` | RLS / session scoped |
| `type` | text, values above |
| `entity_type` | e.g. `booking_request`, `estimate`, `invoice` |
| `entity_id` | uuid |
| `title` | short owner-facing headline |
| `summary` | optional secondary line (client name, ref) |
| `href` | app-relative path |
| `dedupe_key` | unique (account_id, dedupe_key) where not null |
| `created_at` | event time |
| `read_at` | null = unread |

No per-user rows in v1. Mark-read is shared for the account’s office users.

### Retention

- Query and UI only surface events with `created_at >= now() - 90 days`.
- Background prune (worker job or periodic) deletes rows older than 90 days.

### Clear rules

- Bell unread count = `COUNT(*) WHERE read_at IS NULL AND created_at >= now() - 90 days`.
- Open linked record → set `read_at` on matching unread event(s) for that entity (at least the clicked event; preferably all unread for same `entity_type`+`entity_id`).
- “Mark all read” → set `read_at = now()` for all unread on the account.
- Queue badges never use `read_at`.

---

## UI placement

### Desktop

- **Sidebar:** count on Requests and Invoices nav items.
- **Header bell:** unread event count; panel lists recent events (newest first, ~30 visible, still within 90 days); row navigates + marks read; footer “Mark all read”.
- **Overview (`/app`):** Attention card — queue summary line + last ~5 events (unread emphasized).

### Mobile

- Counts on More sheet / hub links for Requests and Invoices.
- Bell in top app bar (sheet-style panel if dropdown is cramped).
- Same Overview Attention card.

### Roles

- Owner and admin only for summary fetch, badges, and bell.
- Tech shell: no attention UI, no API access (403).

### Freshness

- Fetch summary on AppShell mount, on pathname change, and every 45–60s while `document.visibilityState === 'visible'`.
- No toast flood in v1.

### Empty states

- No events in window: “Nothing new in the last 90 days.”
- All read: “All caught up” with optional dimmed recent list.

---

## Architecture

```text
Domain hooks (request create, portal first open, approve/decline, payment status)
        │
        ▼
  attention_events  (append, dedupe_key, read_at, 90-day retention)
        │
        ├── GET /api/v1/attention/summary  → badges + bell count
        └── GET /api/v1/attention/events   → bell list + Overview

Queue badges ← live SQL only (booking_requests open funnel; invoice attention rules)
AppShell polls summary; Overview uses summary + short event list
```

### API (owner/admin)

| Method | Path | Response / behavior |
|---|---|---|
| `GET` | `/api/v1/attention/summary` | `{ requestsCount, invoicesCount, unreadEventCount }` |
| `GET` | `/api/v1/attention/events?limit=` | List (default 30, max 100), newest first, last 90 days |
| `POST` | `/api/v1/attention/events/{id}/read` | Mark one read |
| `POST` | `/api/v1/attention/events/read-all` | Mark all unread read |

Server helpers: `emitAttentionEvent`, `countRequestQueue`, `countInvoiceAttention`, optional mark-read-on-entity-view from detail pages.

### Emit integration points

1. Booking request create route / service.  
2. Estimate portal view recorder (add first-view stamp if missing; emit `estimate.opened`).  
3. Estimate approve / decline transitions.  
4. Existing invoice portal view stamp → emit `invoice.opened` on first set of `first_viewed_at`.  
5. Payment / invoice status path when status becomes `partial` or `paid`.

Emit failures must not break the primary action (log + continue).

### Future channels (not v1)

Same `attention_events` (or a projection) can drive email/push. No channel columns required in v1; avoid hard-coding “in-app only” into the schema beyond the product decision.

---

## Testing

- Unit: request open-funnel count filter; invoice attention OR-rules; dedupe_key prevents double first-open; mark-read / read-all.
- Integration or route tests: summary 403 for tech; emit on booking create; first invoice portal view creates one unread; second view does not.
- UI: badge hidden at 0; `99+`; bell empty and all-caught-up.
- Gate: lint, typecheck, unit for touched packages; integration if DB emit paths are covered by existing harness.

---

## Implementation sketch (for planning)

1. Migration: `attention_events` + indexes (`account_id`, `created_at`, `read_at`, unique `dedupe_key`).  
2. Domain emit helper + queue count helpers.  
3. Attention API routes.  
4. Wire emit at domain hooks.  
5. AppShell badges + bell client.  
6. Overview Attention card.  
7. 90-day prune (worker tick or deploy-cron style job).  
8. Tests + docs/backlog task citing ROADMAP phase if required by repo policy.

---

## Risks & acceptances

| Risk | Mitigation / acceptance |
|---|---|
| Poll lag (tens of seconds) | Accept for desk use; no websocket in v1 |
| Shared mark-read across owner/admin | Accept for single-shop office |
| Estimate open requires view tracking | Implement stamp if missing; skip emit until first open known |
| Badge noise on large open funnel | Full open funnel is intentional; tighten to pending/needs_info only if noisy in dogfood |
| Emit fails silently | Primary flows never fail; monitor logs |

---

## Success criteria

- Owner opens app and sees non-zero Requests/Invoices bubbles when real work exists.  
- Client opens an invoice portal link → within one poll interval, bell unread increases and lists “Invoice opened”.  
- Mark all read / open record clears event unread without zeroing queue badges incorrectly.  
- Events older than 90 days do not appear; prune removes them.  
- Tech UI and APIs remain free of attention chrome.
