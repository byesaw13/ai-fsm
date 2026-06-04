# Ownership Matrix — Dovetails Services LLC

> Which system is the source of truth for which facts.
> When two systems hold related data, this matrix defines the authority.
> Last updated: 2026-05-16

---

## Core Ownership Table

| Truth | Owner | Where stored | Read from | Do NOT read from |
|---|---|---|---|---|
| **Scheduling (when work happens)** | Visit | `visits.scheduled_start`, `visits.scheduled_end` | visits table | `jobs.scheduled_start/end` (legacy fields) |
| **Pricing / quoted amount** | Estimate | `estimates`, `estimate_line_items` | estimate records | Job title or invoice line items |
| **Collected amount** | Invoice + Payment | `invoices`, `payments` | invoice/payment records | Estimate totals |
| **Property history / service record** | Property Timeline | `property_timeline` (view) | timeline view | Ad-hoc job queries |
| **Durable home facts** | Property Vault | `property_vault_items` | vault items | Visit notes, estimate descriptions |
| **Observed deficiencies** | Property Issue | `property_issues` | issues table | Job description, tech notes |
| **Client communication record** | Communications Log | `communications_log` | communications_log | Email provider logs, notification queue |
| **Recurring service terms** | Membership (maintenance_plans) | `maintenance_plans` | maintenance_plans | Job titles, visit descriptions |
| **Technician field evidence** | Visit | `visits`, `visit_checklist_items`, `completion_packets`, `visit_media` | visit records | Job records |
| **Financial close record** | Invoice | `invoices` | invoices | Job status |
| **Automation execution log** | Workflow Events | `workflow_events` | workflow_events | Notification queue |
| **Outbound notification state** | Notification Queue | `notification_queue` | notification_queue | Communications log |
| **Standard pricing inputs** | Price Book | `price_book`, `price_book_modifiers` | price_book | Hardcoded values, estimate history |
| **Business rules / rate constants** | Domain Package | `packages/domain/src/dovetails.ts` | dovetails.ts exports | DB config, app settings |

---

## System Ownership by Domain Area

### Scheduling
**Owner:** Visit

Visits hold `scheduled_start`, `scheduled_end`, `arrived_at`, `completed_at`. A job is "scheduled" when it has a visit in `scheduled` or `in_progress` status. `jobs.scheduled_start` and `jobs.scheduled_end` exist in the schema but are marked legacy — do not write to them in new code.

**Anti-patterns to avoid:**
- Deriving "next appointment" from job fields
- Storing schedule state in automation rules
- Caching visit times in the client record

---

### Pricing
**Owner:** Estimate

The estimate engine (`packages/domain/src/estimate-engine/`) is the only place pricing is computed. Invoices reflect the approved estimate total. Change orders amend the approved estimate. Invoices do not recompute — they inherit.

**Anti-patterns to avoid:**
- Building pricing logic inside invoice creation routes
- Allowing price book to define final customer prices (it feeds estimates, not invoices directly)
- Hard-coding rates anywhere except `dovetails.ts`

---

### Client Communication
**Owner:** Communications Log

All client-facing communications (SMS, email, portal messages) should be logged to `communications_log`. The notification queue drives outbound sends; communications_log is the audit trail.

**Anti-patterns to avoid:**
- Logging communications in job notes or tech notes
- Treating notification_queue entries as the durable record (they are ephemeral)

---

### Property Memory
**Owner:** Property (via vault items, issues, conditions, timeline)

Everything that is true about a home long-term belongs to the property, not the job. When a visit surfaces a fact about the home (e.g., HVAC brand, paint color), it should be captured in the vault, not just in tech notes.

**Anti-patterns to avoid:**
- Storing home facts only in job/visit notes
- Building a "service history" view from jobs alone (use the property timeline view)
- Treating the Homebox assets table as a substitute for vault items

---

### Technician Execution
**Owner:** Visit

What happened in the field is owned by the visit: notes, checklist, photos, parts used, time logged. The job owns the outcome (completed status), but the evidence lives on the visit.

**Anti-patterns to avoid:**
- Writing field notes to job.description
- Attaching visit photos to the job record
- Storing checklist items at the job level

---

### Recurring Logic
**Owner:** Membership Engine (maintenance_plans + dovetails.ts)

Membership tier, visit cadence, cap status, and vault collection targets are computed from `dovetails.ts` constants and `maintenance_plans` enrollment data. Do not replicate this logic in route handlers.

**Anti-patterns to avoid:**
- Computing membership cap logic in the UI layer
- Storing computed cap status in the DB (derive it at query time)
- Duplicating tier definitions outside dovetails.ts

---

### Financial History
**Owner:** Invoice + Payment

Revenue recognition and financial reporting draw from `invoices` and `payments`. Job status `invoiced` is a workflow flag, not the accounting source of truth.

**Anti-patterns to avoid:**
- Summing revenue from estimate totals
- Using job counts as a financial metric
- Building financial reports from job status alone

---

## Ownership Conflict Resolution

When two systems could plausibly own the same fact, use this priority order:

1. **Domain package (`dovetails.ts`)** — for business constants and rate definitions
2. **DB record** — for operational facts that must persist
3. **Derived view** — for computed/aggregate state
4. **Route handler** — only for request-time computation that doesn't need to persist

If you're writing the same fact to two places, pick one owner and derive from it.

---

## Overlaps Under Active Resolution

These overlaps exist today and should be resolved gradually — not in a single refactor:

| Overlap | Systems | Current state | Target |
|---|---|---|---|
| Job scheduling fields | `jobs.scheduled_start/end` vs `visits.scheduled_start` | Both exist; schema comment marks job fields as legacy | Remove from job queries in all new code; schema removal in a future migration |
| "Membership" vs "maintenance plan" | Product language vs DB table name | Mixed usage throughout UI | Keep DB table; migrate all UI copy to "membership" |
| `subscription_addons` column name | `plan_addons` table | Code still uses old name | Rename in code when touching this area; migration TBD |
| Operations dashboard vs operations page | `/app/operations-dashboard` vs `/app/operations` | Two separate routes with overlapping purpose | Merge or clearly differentiate; operations-dashboard = dashboards, operations = scheduling/routing view |
| Multiple dashboards | owner-dashboard, membership-dashboard, operations-dashboard, pricing-dashboard, documents-dashboard | 5 separate dashboard pages | Consolidate under a single dashboard with sections; reduce to 2-3 views max |
| Asset table vs vault | `assets` (Homebox) vs `property_vault_items` | Two distinct concepts but both represent "things about a property" | Keep separate; add clear UI labeling so they are not confused |
