# P7 Interaction Patterns

**Phase:** 7
**Task:** P7-T0
**Status:** Frozen for implementation
**Owner:** agent-orchestrator
**Date:** 2026-02-23

This document defines the reusable interaction patterns that all P7 workspace rewrites must implement. Agent-b, agent-c, and agent-d must reference this document before writing any component code in P7-T2/T3/T4.

---

## Pattern 1: URL-Persisted Filter Bar

### Purpose
Allow filtering list views without losing filter state on page reload, back navigation, or link sharing.

### Existing Implementation
Jobs list at `/app/jobs` already implements this correctly via `searchParams` (Next.js App Router server component props). This is the canonical pattern for all P7 list pages.

### Specification

**Component:** `FilterBar`

**Props:**
```tsx
interface FilterBarProps {
  filters: FilterDef[];    // filter field definitions
  baseHref: string;        // e.g. "/app/jobs"
  activeCount?: number;    // displayed as "N active filters"
}

interface FilterDef {
  name: string;            // query param name
  type: 'text' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}
```

**Behavior:**
1. Renders as `<form method="GET">` — no JavaScript required for filtering.
2. Every filter change submits the form (manual Filter button, or can auto-submit via JS enhancement).
3. Active filters displayed as removable chips below the bar.
4. "Clear all" link resets to `baseHref` with no params.
5. Filter state persists in URL: `?q=foo&status=in_progress&priority=3`.

**Implementation rule:** Filters are read from `searchParams` in the Server Component page. They are passed as `defaultValue` to filter inputs. No client state for filters.

**Standard filter sets by workspace:**

| Workspace | Filters |
|---|---|
| Jobs | `q` (text search), `status` (select), `priority` (select) |
| Visits | `status` (select) / segment tab replaces status filter |
| Estimates | `q` (client search), `status` (select) |
| Invoices | `status` (select), `aging` (select: 0-30/31-60/60+) |

**Layout:**
```
┌──────────────────────────────────────────────────┐
│ [Search input...    ] [Status ▾] [Priority ▾] [Filter] [Clear] │
│ Filtered by: status: In Progress × · search: "roof" ×          │
└──────────────────────────────────────────────────┘
```

**Accessibility:**
- Each filter input has a visible `<label>` (or `aria-label`).
- Form submission with Enter key works.
- "Clear all" is a standard `<a>` link for keyboard navigability.

---

## Pattern 2: Detail Hub Layout

### Purpose
Job detail and estimate detail pages function as operational hubs — the central place for all related actions, rather than requiring navigation between tabs.

### Layout Specification

**Desktop (≥ 768px):**
```
┌─────────────────────────────────────────────────────┐
│  HEADER: Title | Status | Breadcrumb                 │
│  SUBHEADER: key metadata (client, date, etc.)        │
├──────────────────────────────┬──────────────────────┤
│  LEFT COLUMN (flex: 1)       │  RIGHT COLUMN        │
│  min-width: 0                │  width: var(--panel-width) │
│                              │  (380px desktop)     │
│  [Primary content]           │  [Action Panel]      │
│  e.g. Timeline, Line Items   │  e.g. Transitions,   │
│                              │  Convert, Payment    │
│  [Secondary content]         │  [Context Panel]     │
│  e.g. Notes, History         │  e.g. Job link,      │
│                              │  Commercial summary  │
└──────────────────────────────┴──────────────────────┘
```

**Mobile (< 768px):**
```
┌─────────────────────┐
│  HEADER             │
│  SUBHEADER          │
│  [Action Bar]       │  ← Primary actions always visible (sticky bottom)
│  [Primary content]  │
│  [Secondary]        │  ← Right column content stacks below
│  [Context]          │
└─────────────────────┘
```

### Component: `DetailLayout`

```tsx
interface DetailLayoutProps {
  header: React.ReactNode;       // title + status + breadcrumb
  subheader?: React.ReactNode;   // client, dates, metadata
  primary: React.ReactNode;      // left column (timeline, line items)
  actionPanel: React.ReactNode;  // right column top (transitions, convert)
  contextPanel?: React.ReactNode;// right column bottom (related links)
  mobileActions?: React.ReactNode; // sticky bottom bar on mobile
}
```

### Applies To

| Route | Primary Content | Action Panel | Context Panel |
|---|---|---|---|
| `/app/jobs/:id` | Visit Timeline | Status transitions, Schedule Visit | Estimates/Invoices count |
| `/app/estimates/:id` | Line Items + Notes | Transitions, Convert, Delete | Job link |
| `/app/invoices/:id` | Line Items + Payment History | Payment Panel | — |

---

## Pattern 3: Activity Timeline

### Purpose
Show ordered history or upcoming schedule on detail pages. Used for visits within a job, and for tech "My Day" schedule.

### Component: `Timeline`

```tsx
interface TimelineProps {
  entries: TimelineEntry[];
  orientation?: 'vertical';  // always vertical in P7
  emptyMessage?: string;
  action?: React.ReactNode;  // e.g. "+ Schedule Visit" button at end
}

interface TimelineEntry {
  id: string;
  timestamp: string;           // ISO date string
  title: string;               // Primary label
  subtitle?: string;           // Secondary label (e.g. tech name, address)
  status?: string;             // maps to status token for dot color
  badge?: React.ReactNode;     // overdue badge, etc.
  href?: string;               // if set, entry is a link
  isCompleted?: boolean;       // grays out entry
}
```

### Visual Specification

```
time   dot    content
──────────────────────────────
09:00  ●────  HVAC Inspection          → link to /app/visits/[id]
       │      123 Oak St · Assigned: John
10:30  ●────  Water Heater Replace     → link
       │      456 Elm Ave · Unassigned [⚠ Overdue 45m]
─ ─ ─  ○      [+ Schedule Visit]       → action button
```

Dot colors map to visit status tokens:
- `scheduled` → `--status-scheduled-fg` (teal)
- `in_progress` → `--status-in_progress-fg` (blue)
- `completed` → `--color-slate-300` (muted, entry grayed)
- `arrived` → `--status-arrived-fg` (blue)
- `cancelled` → `--color-slate-300` (muted, entry grayed, strikethrough title)

Connecting line:
- Solid for upcoming/active entries
- Dashed for completed/cancelled entries

### Usage in Job Detail

```tsx
// apps/web/app/app/jobs/[id]/page.tsx (P7-T2 rewrite)
<Timeline
  entries={visits.map(v => ({
    id: v.id,
    timestamp: v.scheduled_start,
    title: formatVisitDate(v.scheduled_start),
    subtitle: v.assigned_user_name ? `Tech: ${v.assigned_user_name}` : undefined,
    status: v.status,
    badge: isOverdue(v) ? <OverdueBadge ms={overdueDelta(v)} /> : undefined,
    href: `/app/visits/${v.id}`,
    isCompleted: v.status === 'completed' || v.status === 'cancelled',
  }))}
  emptyMessage="No visits scheduled yet."
  action={canAddVisit ? <ScheduleVisitButton jobId={job.id} /> : undefined}
/>
```

### Usage in Tech "My Day" (Visits Page)

Same `Timeline` component; entries are today's visits sorted by scheduled_start. `href` links to visit detail.

---

## Pattern 4: Payment Panel

### Purpose
Collect payment against an invoice without navigating away from invoice detail. Always visible on desktop, accessible via sticky button on mobile.

### Component: `PaymentPanel`

```tsx
interface PaymentPanelProps {
  invoiceId: string;
  totalCents: number;
  paidCents: number;
  status: InvoiceStatus;
  canRecord: boolean;          // based on role — admin/owner only
}
```

### Visual Specification (desktop sidebar)

```
┌──────────────────────────────┐
│  Payment Summary             │
│  Total:      $1,200.00       │
│  Paid:       $  400.00       │
│  Outstanding:$  800.00  ←bold│
│                              │
│  ──────────────────────────  │
│  Record Payment              │
│  Amount: [___________]       │
│  Method: [Cash ▾    ]        │
│  Note:   [___________]       │
│  [Record Payment]            │
└──────────────────────────────┘
```

- Amount field validates: `0 < amount ≤ outstanding`.
- Inline validation error shown below amount field.
- On success: toast "Payment recorded", panel resets, totals update (full page reload is acceptable for P7-T3; can be optimistic in future).
- If invoice is `paid` or `void`: form is hidden, shows "Invoice closed" message.

### Mobile Behavior

- Payment Summary is visible inline in the left column (below line items).
- "Record Payment" is a sticky bottom button that opens a drawer/sheet with the form.
- Drawer slides up from bottom of screen, 80% height, dismissable via overlay tap or "×" button.

### Component: `RecordPaymentForm` (existing, to be refactored)

The existing `RecordPaymentForm.tsx` (`apps/web/app/app/invoices/[id]/RecordPaymentForm.tsx`) handles the API call. P7-T3 refactors it to:
1. Accept `outstandingCents` prop for validation.
2. Emit success/error via toast instead of page redirect.
3. Be embedded inside `PaymentPanel` rather than a standalone card.

---

## Pattern 5: Mobile Action Bar

### Purpose
On mobile, key primary actions must always be accessible without scrolling. A sticky bottom action bar ensures this for detail pages.

### Component: `MobileActionBar`

```tsx
interface MobileActionBarProps {
  primaryAction?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger';
    loading?: boolean;
  };
  secondaryActions?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  }[];
}
```

### Visual Specification

```
Mobile bottom:
┌────────────────────────────────────────┐
│  [Secondary 1]  [Secondary 2]  [Primary Action]  │
└────────────────────────────────────────┘
   (icon + label)  (icon + label)  (full CTA button)
```

- Fixed to bottom of viewport, above bottom tab bar (z-index: tab-bar + 1).
- Height: 56px + safe-area-inset-bottom (for iOS notch).
- Hidden on desktop (≥ 768px).
- Padding: `--space-4` horizontal.

### Usage by Page

| Page | Primary Action | Secondary Actions |
|---|---|---|
| Visit detail (tech) | "Mark Arrived" / "Start" / "Complete" (current status) | — |
| Visit detail (admin) | "Edit" → opens transition | "Assign" |
| Job detail (admin) | "Schedule Visit" | — |
| Invoice detail (admin) | "Record Payment" | "Mark Sent" |

---

## Pattern 6: Status Transition Actions

### Purpose
Consistent placement and styling of all FSM transition buttons across jobs, visits, estimates, and invoices.

### Specification

**Location on desktop:** Action Panel (right sidebar of Detail Hub).
**Location on mobile:** Mobile Action Bar (primary) + collapsible "More Actions" section in content area (secondary transitions).

**Rendering rule:**
- Only allowed transitions for current status are shown (enforced by domain transition tables).
- Danger transitions (cancelled, void, declined) are rendered in danger variant.
- Primary forward transition is `btn-primary`.
- Secondary/backward transitions are `btn-secondary` or `btn-ghost`.

**Existing implementations to refactor:**
- `JobTransitionForm.tsx` — currently a form card; move into `ActionPanel` component.
- `VisitTransitionForm.tsx` — same.
- `EstimateTransitionForm.tsx` — same.
- `InvoiceTransitionForm.tsx` — same.

All four currently use the same POST-to-route-then-redirect pattern. P7 adds toast on success; keeps redirect.

**Confirmation gate for danger transitions:**
```
Transitions that require confirm before POST:
- Job → cancelled
- Invoice → void
- Estimate → declined

Pattern:
  Click "Cancel Job" → ConfirmDialog opens
  → User confirms → form submitted → toast + redirect
  → User cancels → dialog closes, no action
```

---

## Pattern 7: Skeleton Loading

### Purpose
Replace blank white screens during Server Component data fetching with structural placeholders.

### Implementation

Each workspace page must have a `loading.tsx` sibling in the route directory:

```
apps/web/app/app/
  jobs/
    page.tsx
    loading.tsx        ← NEW in P7-T2
  visits/
    page.tsx
    loading.tsx        ← NEW in P7-T2
  estimates/
    page.tsx
    loading.tsx        ← NEW in P7-T3
  invoices/
    page.tsx
    loading.tsx        ← NEW in P7-T3
  automations/
    page.tsx
    loading.tsx        ← NEW in P7-T4
  page.tsx             (dashboard)
  loading.tsx          ← NEW in P7-T4
```

### Skeleton Component Usage

```tsx
// Example: jobs/loading.tsx
export default function JobsLoading() {
  return (
    <PageContainer>
      <PageHeader>
        <Skeleton width="200px" height="32px" />     {/* title */}
        <Skeleton width="100px" height="36px" />     {/* button */}
      </PageHeader>
      <Skeleton height="48px" />                     {/* filter bar */}
      <div className="status-sections">
        {[1, 2, 3].map(i => (
          <section key={i}>
            <Skeleton width="120px" height="24px" /> {/* status heading */}
            {[1, 2].map(j => (
              <Skeleton key={j} height="80px" />     {/* job cards */}
            ))}
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
```

### Skeleton CSS

```css
.skeleton {
  background: var(--color-slate-100);
  border-radius: var(--radius-sm);
  position: relative;
  overflow: hidden;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255,255,255,0.6) 50%,
    transparent 100%
  );
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

---

## Pattern 8: Quick Assign Modal (Admin — Visits)

### Purpose
Allow admin to assign an unassigned visit to a tech without navigating to visit detail.

### Component: `AssignModal`

```tsx
interface AssignModalProps {
  visitId: string;
  visitLabel: string;          // e.g. "Visit on March 5 at 9:00 AM"
  techs: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;       // triggers router.refresh()
}
```

**Behavior:**
1. Opens from "Assign" quick-action button on unassigned visit cards in `/app/visits`.
2. Shows tech picker (select or radio buttons).
3. Submits `PUT /api/v1/visits/:id` with `assigned_user_id` change.
4. On success: closes modal, toasts "Visit assigned", refreshes page.
5. On failure: shows error inside modal (does not close).

**Tech list source:** Needs a new query in the page (`SELECT id, full_name FROM users WHERE account_id = $1 AND role = 'tech'`). This is a read-only query with no API changes required.

---

## Shared Decisions Across All Patterns

### Do Not Patterns (explicitly forbidden in P7)

| Pattern | Reason |
|---|---|
| Client-side fetch waterfalls | Use Server Components for initial data; avoid `useEffect` + fetch chains |
| Inline `style={{}}` | Use CSS classes with token variables only |
| Hard-coded colors or sizes | All visual values must reference `--token-name` CSS variables |
| Page reloads as the only feedback | All mutations must produce a toast; redirect is acceptable after toast |
| Alert() or confirm() for destructive actions | Use `ConfirmDialog` component |
| `<a>` tags for in-app navigation | Use `<Link>` from next/link |
| Spinner-only loading states | Structural skeleton required |

### Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Component file | PascalCase | `FilterBar.tsx`, `PaymentPanel.tsx` |
| CSS class | kebab-case | `.filter-bar`, `.payment-panel` |
| CSS token | `--category-scale` | `--color-teal-600`, `--space-4` |
| data-testid | `kebab-case` entity name | `data-testid="job-card"`, `data-testid="assign-modal"` |

### State Management Approach

P7 does not introduce external state management (no Redux, Zustand, Jotai).

- **Server state:** Server Components + `router.refresh()` after mutations.
- **UI state:** `useState` in Client Components (modal open/close, form pending, toast queue).
- **Filter state:** URL search params (server-driven).
- **Toast queue:** Single `ToastContext` provided at app layout level.
