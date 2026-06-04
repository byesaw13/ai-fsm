# P7 Screen Map — Route Inventory & Decisions

**Phase:** 7
**Task:** P7-T0
**Status:** Frozen for implementation
**Owner:** agent-orchestrator
**Date:** 2026-02-23

---

## Decision Legend

| Decision | Meaning |
|---|---|
| **Keep** | Current implementation is acceptable. Minor CSS/token updates only. |
| **Rewrite** | Full component and layout rewrite required using P7 design system. |
| **Merge** | Two or more current routes/views consolidated into one. |
| **Remove** | Route removed; behavior handled elsewhere or not needed. |
| **New** | Does not exist yet; must be created in P7. |

---

## 1. Auth Routes

### `/login`
- **Decision:** Keep (minor polish)
- **Current state:** Functional form, demo credentials displayed.
- **P7 changes:**
  - Apply P7 token variables to form inputs, button, and card.
  - Replace inline styles with component classes.
  - Ensure `:focus-visible` ring on inputs.
- **Owner agent:** agent-a
- **Risk:** None — auth logic unchanged.

---

## 2. Root & App Shell

### `/` (root)
- **Decision:** Keep (behavior already correct)
- **Current state:** Middleware redirects to `/login` or `/app` depending on session.
- **P7 changes:** None — middleware behavior is correct.

### `/app` (dashboard)
- **Decision:** Rewrite
- **Current state:** Basic KPI stat cards (Jobs count, Today's Visits, Overdue Invoices) + Quick Actions buttons.
- **Target state (P7-T4):**
  - **Admin/Owner:** Action-oriented KPI row (open jobs, today's visits, unassigned visits, outstanding invoices), Attention Queue section (overdue items needing action, sorted by urgency), Recent Activity feed (last 10 state transitions across jobs/visits/invoices).
  - **Tech:** My Day summary (today's visit count, next scheduled visit), Active Visit widget (if in-progress), Quick links to Visits.
- **Data sources:** All data already available via existing queries in current `page.tsx`. Attention Queue requires one additional query for recent audit_log entries (already exist in DB).
- **Components:** `MetricGrid`, `AttentionQueue`, `ActivityFeed`, `MyDaySummary` (new P7 components).
- **Owner agent:** agent-orchestrator (dashboard is shared surface)
- **P7 task:** P7-T4

---

## 3. Jobs Workspace

### `/app/jobs` (jobs list)
- **Decision:** Rewrite
- **Current state:** Filter bar + status-grouped card list. Priority badges visible. URL-persisted filters (q, status).
- **Target state (P7-T2):**
  - Retain URL-persisted filter behavior — already correct pattern.
  - **Admin view:** Dense table layout (desktop) showing job title, client, status badge, priority badge, last updated. Card layout fallback on mobile.
  - **Tech view:** Card list (no table — mobile-first).
  - Filter bar: search, status select, priority select. "Clear all" link.
  - Status section grouping retained for unfiltered view.
  - Empty state with CTA follows P7 standard.
  - `data-testid` attributes preserved on cards and empty state.
- **Components:** `FilterBar`, `DataTable` (admin desktop), `ItemCard` (mobile + tech), `StatusSection`, `EmptyState`.
- **Owner agent:** agent-b
- **P7 task:** P7-T2

### `/app/jobs/new` (create job)
- **Decision:** Keep (minor polish)
- **Current state:** `JobCreateForm` client component with all required fields (title, client, property, description, priority). Client-side validation and inline errors already present.
- **P7 changes:**
  - Swap raw HTML inputs for P7 `Input`, `Select`, `Textarea` primitives.
  - Apply P7 form layout classes.
  - Submit button uses P7 `Button` component with loading state.
- **Owner agent:** agent-b
- **P7 task:** P7-T2

### `/app/jobs/:id` (job detail)
- **Decision:** Rewrite (most impactful change in P7-T2)
- **Current state:** Sequential cards — Details, Transition, Visits list, Danger Zone. No commercial linkage.
- **Target state — Job Detail Hub:**

```
┌─────────────────────────────────────────────┐
│  ← Jobs   [Job Title]          [Status pill] │
│  [Client name] · [Scheduled date]            │
├───────────────────────┬─────────────────────┤
│  LEFT COLUMN          │  RIGHT COLUMN        │
│  (main content)       │  (sidebar panel)     │
│                       │                      │
│  ┌ Visits Timeline ─┐ │  ┌ Job Details ────┐ │
│  │ [timeline entries]│ │  │ Description     │ │
│  │ + Schedule Visit  │ │  │ Dates           │ │
│  └──────────────────┘ │  │ Priority        │ │
│                       │  └────────────────┘ │
│  ┌ Status Actions ──┐ │  ┌ Commercial ─────┐ │
│  │ [transition btns] │ │  │ Estimates: N    │ │
│  └──────────────────┘ │  │ Invoices: N     │ │
│                       │  │ [→ View all]    │ │
│  ┌ Danger Zone ─────┐ │  └────────────────┘ │
│  │ (owner only/draft)│ │                      │
│  └──────────────────┘ │                      │
└───────────────────────┴──────────────────────┘
```

- **Mobile:** Single column. Sidebar panel collapses to accordion below timeline.
- **Tech view:** Visits Timeline + job info only. No Status Actions, no Commercial panel, no Danger Zone.
- **New data required:** Count of estimates and invoices linked to job (`job_id` FK on estimates/invoices tables — already exists in DB schema). Requires a join query added to the page.
- **Components:** `Timeline`, `TimelineEntry`, `SidePanel`, `CommercialLinksPanel`, `JobTransitionForm` (refactored as inline action).
- **data-testid preserved:** `job-status`, `job-transition-panel`, `add-visit-btn`, `visits-empty`, `danger-zone`.
- **Owner agent:** agent-b
- **P7 task:** P7-T2

### `/app/jobs/:id/visits/new` (schedule visit)
- **Decision:** Keep (minor polish)
- **Current state:** `VisitScheduleForm` with start/end/assignment fields. Role-aware assignment.
- **P7 changes:** Apply P7 `Input`, `Select`, `Button` primitives. Toast on success.
- **Owner agent:** agent-b
- **P7 task:** P7-T2

---

## 4. Visits Workspace

### `/app/visits` (visits list)
- **Decision:** Rewrite
- **Current state:** Status-grouped list. Tech gets "My Day" timeline view (today's visits). Admin gets metrics grid + overdue section + unassigned + today columns.
- **Target state (P7-T2):**
  - **Segmented tab bar:** Today / Upcoming / Overdue / All (admin). Tech sees only Today and All.
  - Admin summary row: Needs Assignment count, Today count, Active Now count, Overdue count — as clickable filter chips.
  - Overdue visits highlighted with alert border and relative time badge ("2h overdue").
  - Tech My Day: Timeline view (retained, enhanced with P7 Timeline component).
  - Quick assign action on unassigned visit cards (admin only) — opens `AssignModal` without navigating away.
- **Components:** `SegmentedTabs`, `FilterChips`, `ItemCard`, `Timeline`, `AssignModal`, `EmptyState`.
- **data-testid preserved:** `visits-empty`, `visit-card`, `unassigned-badge`.
- **Owner agent:** agent-b
- **P7 task:** P7-T2

### `/app/visits/:id` (visit detail)
- **Decision:** Rewrite
- **Current state:** Visit info, `VisitTransitionForm`, `VisitNotesForm` as separate card sections.
- **Target state (P7-T2):**
  - Single-column layout.
  - Status actions prominent at top (not buried in card).
  - Notes textarea immediately visible (not behind a form submit flow).
  - Back link to parent job (not just back to visits list).
  - Overdue indicator banner if visit is past scheduled time and not completed.
  - Tech: large "Mark Arrived / Start / Complete" action buttons (48px+).
- **Components:** `StatusActionBar`, `NotesCard`, `OverdueBanner`, `Button`.
- **data-testid preserved:** (inherited from current VisitTransitionForm/VisitNotesForm — must map).
- **Owner agent:** agent-b
- **P7 task:** P7-T2

---

## 5. Estimates Workspace

### `/app/estimates` (estimates list)
- **Decision:** Rewrite
- **Current state:** Metrics grid (Total, Pending, Won) + funnel bar + status-grouped card list.
- **Target state (P7-T3):**
  - Metrics grid retained and styled with P7 tokens.
  - Funnel bar retained (simplified to 3 horizontal stages with count + value, not percentage width bars).
  - Filter bar: status select, client search.
  - Dense list view (desktop table): client name, total, status, expires/sent date, aging indicator.
  - Card view (mobile): client name, total, status badge, expiry.
  - Expiring-soon warning badge (< 7 days) in amber; expired in red.
- **Components:** `FilterBar`, `DataTable`, `ItemCard`, `FunnelSummary`, `MetricGrid`, `EmptyState`.
- **data-testid preserved:** `estimates-empty`, `estimate-card`, `create-estimate-btn`.
- **Owner agent:** agent-c
- **P7 task:** P7-T3

### `/app/estimates/new` (create estimate)
- **Decision:** Keep (minor polish)
- **Current state:** Form with job/client/line items. Already functional.
- **P7 changes:** Apply P7 Input/Select/Button primitives. Toast on success.
- **Owner agent:** agent-c
- **P7 task:** P7-T3

### `/app/estimates/:id` (estimate detail)
- **Decision:** Rewrite
- **Current state:** Line items table, internal notes form, transition buttons, convert button — sequential cards.
- **Target state (P7-T3):**

```
┌─────────────────────────────────────────────┐
│  ← Estimates  [Client Name]  [Status pill]   │
│  Created: [date] · Expires: [date]           │
├─────────────────────────┬───────────────────┤
│  LEFT (main)            │  RIGHT (sidebar)  │
│  ┌ Line Items ────────┐ │  ┌ Actions ──────┐ │
│  │ [table of items]   │ │  │ [Transitions] │ │
│  │ Subtotal / Tax     │ │  │ [Convert btn] │ │
│  │ Total              │ │  │ [Delete btn]  │ │
│  └───────────────────┘ │  └──────────────┘ │
│  ┌ Internal Notes ───┐ │  ┌ Job link ─────┐ │
│  │ [textarea]        │ │  │ → View Job    │ │
│  └───────────────────┘ │  └──────────────┘ │
└─────────────────────────┴───────────────────┘
```

- **Components:** `LineItemsTable`, `TotalsSummary`, `NotesCard`, `ActionSidebar`, `EstimateTransitionForm`, `EstimateConvertButton`, `DeleteEstimateButton`.
- **data-testid preserved:** All existing testids on buttons and cards.
- **Owner agent:** agent-c
- **P7 task:** P7-T3

---

## 6. Invoices Workspace

### `/app/invoices` (invoices list)
- **Decision:** Rewrite
- **Current state:** Metrics grid (Outstanding, Overdue, Collected) + status-grouped card list with aging indicators.
- **Target state (P7-T3):**
  - Aging bucket summary: 0–30 days, 31–60 days, 60+ days overdue buckets (clickable to filter).
  - Metrics grid retained with P7 tokens; Outstanding card red when > 0 overdue.
  - Dense table (desktop): invoice number, client, total, amount due, status, due date/aging.
  - Card (mobile): invoice number, client, amount due, status badge, aging pill.
- **Components:** `MetricGrid`, `AgingBuckets`, `FilterBar`, `DataTable`, `ItemCard`, `EmptyState`.
- **data-testid preserved:** `invoices-empty`, `invoice-card`.
- **Owner agent:** agent-c
- **P7 task:** P7-T3

### `/app/invoices/:id` (invoice detail)
- **Decision:** Rewrite
- **Current state:** Invoice header, line items, transition form, payment history table, record payment form — all sequential cards.
- **Target state (P7-T3):**

```
┌─────────────────────────────────────────────┐
│  ← Invoices  [Invoice #]     [Status pill]   │
│  [Client] · Due: [date] · [Aging indicator]  │
├─────────────────────────┬───────────────────┤
│  LEFT (main)            │  RIGHT (sidebar)  │
│  ┌ Line Items ────────┐ │  ┌ Payment Panel ┐ │
│  │ [table of items]   │ │  │ Total: $X     │ │
│  │ Subtotal/Tax/Total │ │  │ Paid: $Y      │ │
│  └───────────────────┘ │  │ Due: $Z       │ │
│  ┌ Payment History ──┐ │  │ [Record Pmt]  │ │
│  │ [payment entries] │ │  │               │ │
│  │ [empty if none]   │ │  │ [Transitions] │ │
│  └───────────────────┘ │  └──────────────┘ │
└─────────────────────────┴───────────────────┘
```

- Payment panel always visible on desktop (sticky sidebar).
- Mobile: payment panel collapses to drawer/accordion.
- Payment amount field validates against `total_cents - paid_cents` (must not exceed outstanding).
- **Components:** `LineItemsTable`, `TotalsSummary`, `PaymentPanel`, `PaymentHistory`, `RecordPaymentForm`, `InvoiceTransitionForm`.
- **data-testid preserved:** All existing testids on forms and payment sections.
- **Owner agent:** agent-c
- **P7 task:** P7-T3

---

## 7. Automations Workspace

### `/app/automations` (automations)
- **Decision:** Rewrite
- **Current state:** `AutomationsClient` renders Visit Reminders section, Overdue Follow-ups section, Recent Events section. Stats (24h/7d sent/skipped/errors). Manual "Run now" buttons.
- **Target state (P7-T4):**
  - Health summary row: last run time, success/skip/error counts, health badge (Healthy / Degraded / Error).
  - Per-automation cards: name, last run time, last run result, manual run button.
  - Recent events log: paginated list of automation events with type, timestamp, result.
  - Tech role: read-only view of automation health (no run controls).
- **Components:** `AutomationHealthCard`, `EventLog`, `RunButton`, `StatusBadge`.
- **Owner agent:** agent-d
- **P7 task:** P7-T4

---

## 8. App Shell (layout)

### `/app/layout.tsx` + `AppShell.tsx`
- **Decision:** Rewrite (P7-T1 — must happen before all page rewrites)
- **Current state:** Top header with hamburger menu (mobile). Logo, nav links, role badge, logout in header.
- **Target state (P7-T1):**
  - Desktop: Fixed left sidebar (240px). Logo + nav items + user chip + logout at bottom.
  - Tablet: Collapsed sidebar (56px icon-only with tooltip).
  - Mobile: Fixed bottom tab bar (5 primary tabs, "More" for overflow).
  - Active state: left accent border + background highlight (matches Dovelite `AdminLayout.tsx` pattern).
- **Source:** Dovelite `AdminLayout.tsx` — sidebar + bottom nav dual pattern adopted.
- **data-testid:** No existing testids on shell elements. New ones added per P7-T5 accessibility sweep.
- **Owner agent:** agent-orchestrator (layout is shared; requires shared-file lock)
- **P7 task:** P7-T1

---

## 9. New Routes Required in P7

| Route | Purpose | P7 Task | Owner |
|---|---|---|---|
| None | All new surfaces fit within existing routes | — | — |

No new routes are required. All P7 changes are within existing route structure. A `/app/dashboard` alias is not needed — `/app` IS the dashboard.

---

## 10. Removed Routes

None. All existing routes are retained.

---

## 11. Decision Summary Table

| Route | Decision | P7 Task | Owner Agent |
|---|---|---|---|
| `/login` | Keep + polish | P7-T1 | agent-a |
| `/app` (dashboard) | Rewrite | P7-T4 | agent-orchestrator |
| `/app/jobs` | Rewrite | P7-T2 | agent-b |
| `/app/jobs/new` | Keep + polish | P7-T2 | agent-b |
| `/app/jobs/:id` | Rewrite (hub) | P7-T2 | agent-b |
| `/app/jobs/:id/visits/new` | Keep + polish | P7-T2 | agent-b |
| `/app/visits` | Rewrite | P7-T2 | agent-b |
| `/app/visits/:id` | Rewrite | P7-T2 | agent-b |
| `/app/estimates` | Rewrite | P7-T3 | agent-c |
| `/app/estimates/new` | Keep + polish | P7-T3 | agent-c |
| `/app/estimates/:id` | Rewrite (hub) | P7-T3 | agent-c |
| `/app/invoices` | Rewrite | P7-T3 | agent-c |
| `/app/invoices/:id` | Rewrite (payment panel) | P7-T3 | agent-c |
| `/app/automations` | Rewrite | P7-T4 | agent-d |
| `AppShell` + layout | Rewrite | P7-T1 | agent-orchestrator |

---

## 12. CSS Strategy — File Structure (P7-T1)

Current `apps/web/app/globals.css` is a single large file (~600+ lines). P7-T1 must restructure it:

```
apps/web/app/
  globals.css          ← imports all below, no direct styles
  styles/
    tokens.css         ← all CSS custom properties (from P7_UX_SPEC.md §4.1)
    reset.css          ← minimal CSS reset
    layout.css         ← app-shell, sidebar, bottom-nav, page-container
    components.css     ← card, button, badge, input, modal, toast, skeleton
    utilities.css      ← spacing helpers, text helpers, display helpers
    animations.css     ← shimmer, fade-in, slide-up
```

The existing class names (`.page-container`, `.card`, `.btn`, `.status-pill`, etc.) MUST be preserved during the restructure — they are used by existing pages that haven't been rewritten yet. New classes are additive. Old classes are deprecated in comments but not removed until the page using them is rewritten in P7-T2/T3/T4.
