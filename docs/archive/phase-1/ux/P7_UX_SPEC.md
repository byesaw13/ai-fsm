# P7 UX Spec — Jobber-Grade Rewrite

**Phase:** 7
**Task:** P7-T0
**Status:** Frozen for implementation
**Owner:** agent-orchestrator
**Date:** 2026-02-23

---

## 1. Mission

Upgrade ai-fsm from a functional MVP UI into a production-quality field service interface that field techs and office admins can use all day, every day. All existing backend logic (APIs, auth, RLS, domain transitions) is preserved. Only the presentation layer changes.

---

## 2. Information Architecture

### 2.1 Route Hierarchy

```
/ (root)
  └── /login                      (auth)
  └── /app                        (protected, requires session)
        ├── /app                  → Dashboard (role-aware KPIs + actions)
        ├── /app/jobs             → Jobs workspace (list + filter)
        │     ├── /app/jobs/new   → Create job form
        │     └── /app/jobs/:id   → Job detail hub
        │           └── /app/jobs/:id/visits/new  → Schedule visit
        ├── /app/visits           → Visits workspace (segmented list)
        │     └── /app/visits/:id → Visit detail
        ├── /app/estimates        → Estimates workspace (list + funnel)  [admin/owner only]
        │     ├── /app/estimates/new  → Create estimate
        │     └── /app/estimates/:id  → Estimate detail
        ├── /app/invoices         → Invoices workspace (list + aging)    [admin/owner only]
        │     └── /app/invoices/:id   → Invoice detail + payment panel
        └── /app/automations      → Automations workspace               [admin/owner only]
```

### 2.2 Navigation Model

**Desktop (≥ 1024px):** Fixed left sidebar, 240px wide, icon + label nav items. Sidebar contains: logo, nav items, user role chip, logout.

**Tablet (768–1023px):** Collapsed sidebar (icon-only, 56px wide) with tooltip labels on hover.

**Mobile (< 768px):** Fixed bottom tab bar (5 primary tabs, "More" overflow for admin). Top header with logo + hamburger reserved for non-nav actions only.

Source: Dovelite `AdminLayout.tsx` — adopted sidebar + bottom nav dual pattern; adapted for ai-fsm's role-filtered nav items.

### 2.3 Nav Items by Role

| Route | Owner/Admin | Tech |
|---|---|---|
| Dashboard (`/app`) | ✓ | ✓ |
| Jobs (`/app/jobs`) | ✓ | ✓ |
| Visits (`/app/visits`) | ✓ | ✓ |
| Estimates (`/app/estimates`) | ✓ | ✗ |
| Invoices (`/app/invoices`) | ✓ | ✗ |
| Automations (`/app/automations`) | ✓ | ✗ |

### 2.4 Dashboard as Entry Point

- `/app` is the authenticated root. Do NOT redirect away from it.
- Current redirect to `/app/jobs` from root removed — replace with role-aware dashboard content.
- Tech sees: today's schedule, their active visit count, a "Start Day" CTA.
- Admin/Owner sees: KPI row, attention queue (overdue invoices + unassigned visits), recent activity.

---

## 3. Role UX

### 3.1 Tech Role

**Primary use case:** Mobile, in the field, checking schedule and updating visit status.

**UX Priorities:**
1. "My Day" — today's timeline is the first thing they see on Visits.
2. Visit detail reachable in 2 taps from dashboard.
3. Large tap targets (min 48px) for field-glove use.
4. Status transitions visible and prominent (not buried in a form card).
5. Notes input accessible without scrolling on a phone.

**What tech cannot access:**
- Estimates, Invoices, Automations nav items hidden.
- Client financial details hidden on job detail.
- No create-job or delete actions.

### 3.2 Admin / Owner Role

**Primary use case:** Desktop, operations management, scheduling, quoting, billing.

**UX Priorities:**
1. Dense information display — see more on screen, fewer clicks to data.
2. Quick actions on list rows (e.g., assign visit, convert estimate) without opening detail.
3. Financial visibility — outstanding totals, overdue aging, payment status at a glance.
4. Bulk-awareness — metrics and counts on every workspace.
5. Automation health visible without navigating away.

---

## 4. Visual System

### 4.1 Design Token Contract

These CSS custom properties are the single source of truth. All P7 components use only these tokens — no raw hex values or hardcoded sizes in component CSS.

```css
/* Color — Primitives */
--color-teal-600: #0d7a5f;
--color-teal-500: #0fa07d;
--color-teal-100: #d1fae5;
--color-teal-50:  #ecfdf5;

--color-slate-900: #0f172a;
--color-slate-700: #334155;
--color-slate-500: #64748b;
--color-slate-300: #cbd5e1;
--color-slate-100: #f1f5f9;
--color-slate-50:  #f8fafc;

--color-red-600:   #dc2626;
--color-red-100:   #fee2e2;
--color-amber-600: #d97706;
--color-amber-100: #fef3c7;
--color-green-600: #16a34a;
--color-green-100: #dcfce7;
--color-blue-600:  #2563eb;
--color-blue-100:  #dbeafe;

/* Color — Semantic Aliases */
--bg:            var(--color-slate-50);
--bg-card:       #ffffff;
--fg:            var(--color-slate-900);
--fg-muted:      var(--color-slate-500);
--border:        var(--color-slate-300);
--border-subtle: var(--color-slate-100);
--accent:        var(--color-teal-600);
--accent-hover:  var(--color-teal-500);
--accent-subtle: var(--color-teal-50);

/* Status Semantic */
--status-draft-bg:      var(--color-slate-100);
--status-draft-fg:      var(--color-slate-700);
--status-sent-bg:       var(--color-blue-100);
--status-sent-fg:       var(--color-blue-600);
--status-approved-bg:   var(--color-green-100);
--status-approved-fg:   var(--color-green-600);
--status-declined-bg:   var(--color-red-100);
--status-declined-fg:   var(--color-red-600);
--status-expired-bg:    var(--color-amber-100);
--status-expired-fg:    var(--color-amber-600);
--status-paid-bg:       var(--color-green-100);
--status-paid-fg:       var(--color-green-600);
--status-overdue-bg:    var(--color-red-100);
--status-overdue-fg:    var(--color-red-600);
--status-partial-bg:    var(--color-amber-100);
--status-partial-fg:    var(--color-amber-600);
--status-void-bg:       var(--color-slate-100);
--status-void-fg:       var(--color-slate-500);
--status-in_progress-bg: var(--color-blue-100);
--status-in_progress-fg: var(--color-blue-600);
--status-scheduled-bg:  var(--color-teal-100);
--status-scheduled-fg:  var(--color-teal-600);
--status-completed-bg:  var(--color-green-100);
--status-completed-fg:  var(--color-green-600);
--status-cancelled-bg:  var(--color-slate-100);
--status-cancelled-fg:  var(--color-slate-500);
--status-arrived-bg:    var(--color-blue-100);
--status-arrived-fg:    var(--color-blue-600);
--status-quoted-bg:     var(--color-blue-100);
--status-quoted-fg:     var(--color-blue-600);
--status-invoiced-bg:   var(--color-teal-100);
--status-invoiced-fg:   var(--color-teal-600);

/* Priority Semantic */
--priority-urgent-bg:   var(--color-red-100);
--priority-urgent-fg:   var(--color-red-600);
--priority-high-bg:     var(--color-amber-100);
--priority-high-fg:     var(--color-amber-600);
--priority-medium-bg:   var(--color-blue-100);
--priority-medium-fg:   var(--color-blue-600);
--priority-low-bg:      var(--color-slate-100);
--priority-low-fg:      var(--color-slate-500);

/* Typography */
--font-sans:     -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--text-xs:       0.75rem;   /* 12px */
--text-sm:       0.875rem;  /* 14px */
--text-base:     1rem;      /* 16px */
--text-lg:       1.125rem;  /* 18px */
--text-xl:       1.25rem;   /* 20px */
--text-2xl:      1.5rem;    /* 24px */
--text-3xl:      1.875rem;  /* 30px */
--leading-tight: 1.25;
--leading-normal: 1.5;
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* Spacing */
--space-1:  0.25rem;  /* 4px */
--space-2:  0.5rem;   /* 8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */

/* Borders & Radii */
--radius-sm:  4px;
--radius-md:  8px;
--radius-lg:  12px;
--radius-xl:  16px;
--radius-full: 9999px;

/* Elevation / Shadow */
--shadow-xs: 0 1px 2px rgba(0,0,0,.05);
--shadow-sm: 0 1px 3px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.06);
--shadow-md: 0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06);
--shadow-lg: 0 10px 15px rgba(0,0,0,.10), 0 4px 6px rgba(0,0,0,.05);

/* Layout */
--sidebar-width:          240px;
--sidebar-collapsed-width: 56px;
--header-height:          56px;
--content-max-width:      1280px;
--panel-width:            380px;
```

### 4.2 Typography Scale Usage

| Use | Token | Weight |
|---|---|---|
| Page title | `--text-2xl` | semibold |
| Section heading | `--text-lg` | semibold |
| Card title / list item primary | `--text-base` | medium |
| Body / description | `--text-sm` | normal |
| Label / caption / badge | `--text-xs` | medium |
| KPI value (dashboard) | `--text-3xl` | bold |

### 4.3 Spacing System Usage

- Card padding: `--space-4` (mobile), `--space-6` (desktop)
- Section gap: `--space-6`
- Form field gap: `--space-4`
- List item padding: `--space-3` vertical, `--space-4` horizontal
- Page container padding: `--space-4` (mobile), `--space-8` (desktop)

---

## 5. Global UX Standards

### 5.1 Empty States

Every list/workspace that can be empty MUST have a styled empty state:

- **Icon** — descriptive icon or illustration (text emoji acceptable; real SVG preferred for P7-T5)
- **Title** — "No [entity] yet" or role-specific "No visits assigned"
- **Description** — one sentence explaining how to proceed
- **CTA** — primary action button if user has permission to create

```
Empty state pattern:
┌─────────────────────────┐
│         [icon]          │
│    No jobs yet          │
│  Create your first job  │
│  to start tracking work │
│   [ + New Job ]         │
└─────────────────────────┘
```

### 5.2 Loading States

All async-rendered pages MUST export a `loading.tsx` sibling that renders skeleton placeholders matching the target layout.

Skeleton rules:
- Match the height and width of actual content elements
- Use `--color-slate-100` background with shimmer animation
- Do NOT show spinners alone — show structural skeletons

### 5.3 Error States

Every Server Component that fetches data MUST have a corresponding `error.tsx`:
- Show error message
- Provide a "Retry" button (triggers router.refresh())
- Log error to structured logger

Client-side form errors:
- Inline, below the field
- Color: `--color-red-600`
- Clear on re-focus

### 5.4 Toast Notifications

All destructive and significant actions must produce a toast:
- Success: green, auto-dismiss 4s
- Error: red, manual dismiss
- Position: bottom-right desktop, bottom-center mobile
- Stack up to 3; oldest dismissed first

Trigger points:
- Job/visit/estimate/invoice transition success/failure
- Estimate conversion success
- Payment recorded
- Delete confirmed

Implementation: lightweight client-side toast context (no external lib). Single `<ToastContainer>` in app layout.

### 5.5 Confirmation Dialogs

Destructive actions require confirmation before executing:
- Delete job (draft only)
- Void invoice
- Any `cancelled` / `void` transition

Pattern: modal overlay with title, description of consequence, Cancel and Confirm buttons. Confirm is danger-styled (`--color-red-600` background).

### 5.6 Form Validation

All forms must show:
- Required field indicator (`*`)
- Inline error below field on blur/submit attempt
- Form-level error summary if server returns an error
- Submit button disabled while pending
- Success: redirect or toast, not both

### 5.7 Accessibility Baseline

- All interactive elements must have visible focus ring using `--accent` color
- Color is never the sole indicator of status — status pills include text
- All form inputs have associated `<label>` elements
- Buttons have descriptive `aria-label` when icon-only
- Modals trap focus and return focus on close
- Minimum tap target: 44×44px

### 5.8 Responsive Breakpoints

| Name | Width | Shell |
|---|---|---|
| mobile | < 768px | Bottom tab bar |
| tablet | 768–1023px | Collapsed sidebar (icon only) |
| desktop | ≥ 1024px | Full sidebar (icon + label) |

---

## 6. Component Inventory for P7-T1

The following components must be built in P7-T1 before any page rewrites begin.

### 6.1 Primitives (packages/ui or apps/web/components/ui/)

| Component | Props | Notes |
|---|---|---|
| `Badge` | `variant`, `size` | Status pills, priority badges, count chips |
| `Button` | `variant`, `size`, `loading`, `disabled` | primary/secondary/danger/ghost |
| `Input` | `label`, `error`, `required` | Text, date, number |
| `Select` | `label`, `error`, `options` | Styled native select |
| `Textarea` | `label`, `error`, `rows` | Resizable |
| `Skeleton` | `width`, `height`, `lines` | Shimmer animation |
| `Card` | `padding`, `hover`, `as` | Container with shadow |
| `Modal` | `open`, `onClose`, `title` | Overlay + focus trap |
| `Toast` | `type`, `message`, `onDismiss` | Success/error/info |
| `ConfirmDialog` | `open`, `title`, `body`, `onConfirm`, `onCancel` | Danger confirmation |

Source: Dovelite `Button.tsx`, `Input.tsx`, `Skeleton.tsx` — adopt the interface shape; reimplement against ai-fsm CSS tokens.

### 6.2 Layout Components

| Component | Notes |
|---|---|
| `AppShell` | Sidebar (desktop), bottom tabs (mobile), role-filtered nav |
| `PageContainer` | Max-width wrapper with responsive padding |
| `PageHeader` | Title + subtitle + right-slot for primary CTA |
| `SectionHeader` | Section title + count badge + optional action |
| `FilterBar` | Search input + select filters + clear, URL-persisted |
| `MetricGrid` | 3–4 column KPI cards, responsive |
| `EmptyState` | Icon + title + description + optional CTA |
| `StatusSection` | Collapsible status group with count badge |

### 6.3 Table / List Components

| Component | Notes |
|---|---|
| `DataTable` | Dense table view for admin, sortable columns, optional |
| `ItemCard` | Card-style list item (current job-card/visit-card unified) |
| `TimelineEntry` | Single entry in activity/visit timeline |
| `Timeline` | Container for ordered `TimelineEntry` list |

---

## 7. Constraints and Non-Negotiables

1. **No API changes.** All P7 changes are presentation-layer only. Existing `/api/v1/**` routes unchanged.
2. **No auth/RLS changes.** Role checks at page level remain. Component-level guards (`canTransitionJob`, `canCreateVisit`, etc.) remain.
3. **No new DB migrations.** P7 uses only data already available.
4. **CSS strategy.** Extend/replace `globals.css` with P7 token system. Keep custom CSS (no Tailwind), structured into: `tokens.css`, `reset.css`, `components.css`, `layout.css`, `utilities.css`, and assembled in `globals.css`.
5. **Quality gate must pass.** Every PR must pass `pnpm gate` (lint + typecheck + build + test). No exemptions.
6. **Existing test IDs preserved.** All `data-testid` attributes on current elements must be preserved or migrated to new components with the same value. E2E specs must remain green.
