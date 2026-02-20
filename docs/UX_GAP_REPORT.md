# UX Gap Report

**Generated:** 2026-02-19
**Auditor:** agent-orchestrator
**Scope:** Jobs/Visits/Estimates/Invoices home experiences and navigation consistency

## Executive Summary

The AI-FSM app has a functional MVP UI with basic CRUD operations and role-based access. However, the UX lacks production-level polish needed for daily operational use. This report identifies gaps and prioritizes fixes.

---

## Current User Journey Mapping

### Owner/Admin Journey: login -> jobs
- **Login page:** Clean, functional. Demo credentials visible (good for dev).
- **Redirect:** `/` redirects directly to `/app/jobs` - no dashboard.
- **First impression:** Plain header with nav links, no branding.

### Owner/Admin Journey: jobs -> job detail -> visits
- **Jobs list:** Grouped by status, but no filtering/search.
- **Job detail:** Basic info, visits list, transition buttons.
- **Create visit:** Separate page, basic form.
- **Gap:** No inline scheduling; requires full page navigation.

### Owner/Admin Journey: estimates -> convert -> invoices -> payments
- **Estimates list:** Grouped by status.
- **Estimate detail:** Line items, convert button.
- **Invoice detail:** Payment recording available.
- **Gap:** No visibility of conversion pipeline status.

### Tech Journey: login -> visits
- **Visits list:** Shows only assigned visits.
- **Visit detail:** Can update status and notes.
- **Gap:** No "my day" or schedule context view.

---

## Identified Gaps by Category

### 1. Navigation & Shell (High Priority)

| Issue | Current State | Target State | Impact |
|-------|---------------|--------------|--------|
| No active nav indicator | All nav links look identical | Active link highlighted | Users lose context |
| No app branding | Plain "AI-FSM" text | Logo + brand identity | Looks unprofessional |
| No mobile nav | Horizontal links collapse poorly | Hamburger menu or bottom nav | Mobile unusable |
| No dashboard | Root redirects to jobs | Dashboard with key metrics | No operational overview |
| No breadcrumbs | Only back links | Full breadcrumb trail | Deep navigation confusing |

### 2. Jobs Workspace (Medium Priority)

| Issue | Current State | Target State | Impact |
|-------|---------------|--------------|--------|
| No priority indicator | Priority exists but not visible | Priority badge on cards | Can't triage quickly |
| No search/filter | Scroll through all jobs | Filter by status, client, date | Slow for many jobs |
| Empty states minimal | Text only | Illustration + CTA | Feels incomplete |
| No quick actions | Must open detail | Quick status change menu | Extra clicks |

### 3. Visits Workspace (Medium Priority)

| Issue | Current State | Target State | Impact |
|-------|---------------|--------------|--------|
| Tech view sparse | Just list of visits | "My Day" view with schedule | Poor tech experience |
| No calendar view | List only | Calendar option | Hard to see schedule |
| Assignment not actionable | Shows "Unassigned" badge | Quick assign modal | Requires visit detail |
| Overdue not highlighted | Listed in scheduled section | Alert banner or highlight | Missed visits slip |

### 4. Estimates/Invoices Workspace (Medium Priority)

| Issue | Current State | Target State | Impact |
|-------|---------------|--------------|--------|
| No pipeline visibility | Separate lists | Conversion funnel view | Hard to track deals |
| No totals summary | Per-item only | Outstanding total card | Manual calculation |
| No quick convert | Must open estimate | Convert button on list | Extra clicks |
| Invoice aging hidden | Status only | Days overdue indicator | Collections blind |

### 5. General UX (Lower Priority)

| Issue | Current State | Target State | Impact |
|-------|---------------|--------------|--------|
| No toast notifications | Page reloads | Toast on actions | Unclear success/failure |
| No global search | None | Search across entities | Hard to find items |
| No loading skeletons | Blank during load | Skeleton placeholders | Feels slow |
| No confirmation dialogs | Immediate action | Confirm destructive ops | Risk of mistakes |

---

## Prioritization

### P6-T1A: Global Shell + Navigation (Must Have)
- Active nav indicator
- App branding/logo
- Dashboard/home redirect option
- Mobile-responsive nav

### P6-T1B: Jobs Polish (Should Have)
- Priority badge on cards
- Search/filter capability
- Improved empty states

### P6-T1C: Visits Polish (Should Have)
- "My Day" view for tech
- Overdue highlighting
- Quick assignment

### P6-T1D: Estimates/Invoices Polish (Nice to Have)
- Outstanding totals
- Conversion funnel cues
- Invoice aging indicators

---

## Reference Sources

### From Dovelite (UX Patterns)
- `/home/nick/dev/dovelite/components/AdminLayout.tsx` - Sidebar nav with active states
- `/home/nick/dev/dovelite/app/admin/page.tsx` - Dashboard with metrics
- `/home/nick/dev/dovelite/app/admin/visits/` - Visit management patterns

### From Myprogram (Structure)
- `/home/nick/dev/myprogram/frontend/` - Multi-app organization patterns

---

## Recommendations

1. **Start with shell/nav** - Foundation affects all pages
2. **Add dashboard** - Replace root redirect with actionable overview
3. **Improve mobile** - Critical for field tech usage
4. **Iterate on workspaces** - Each module gets consistent polish pass

## Residual Risks

- Mobile-first approach may require significant CSS restructuring
- Dashboard metrics may need new API endpoints (avoid backend changes if possible)
- Toast notifications require client-side state management (consider adding)
