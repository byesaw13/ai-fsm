# Domain Model — Dovetails Services LLC

> **This is the source of truth for all object definitions.**
> When naming conflicts arise in code, UI copy, or migrations, this file wins.
> Last updated: 2026-05-16

---

## Hierarchy at a glance

```
account
  └── users (owner | admin | tech)
  └── clients
        └── properties                  ← long-term relationship record
              ├── jobs                  ← business commitment
              │     ├── visits          ← field execution
              │     ├── estimates       ← pricing proposals
              │     └── invoices        ← collection records
              ├── maintenance_plans     ← membership enrollments (see: MEMBERSHIP)
              ├── property_vault_items  ← durable home facts
              ├── property_issues       ← tracked deficiencies
              ├── property_notes        ← free-form observations
              └── property_condition_snapshots
```

---

## Object Definitions

### ACCOUNT
The top-level tenant. Dovetails is a single-tenant deployment so there is always exactly one account in production. The `accounts` table exists for multi-tenancy isolation — treat it as infrastructure, not a product concept.

### USER
A staff member with a role: `owner`, `admin`, or `tech`. Users belong to an account. Technicians (tech) are the field workers; the owner has full system access. There is no separate "technician" entity — users are technicians.

### CLIENT
A homeowner or relationship account. The client represents the **person**, not the house.

**Owns:**
- Contact details (name, email, phone)
- Communication preferences and SMS consent
- Portal access token
- Communications log entries
- Multiple properties

**Does NOT own:**
- Service history (that lives on property/job)
- Scheduling state
- Financial totals (those roll up from invoices)

**Canonical name:** `client` (never "customer", "contact", or "homeowner" in code/DB)

---

### PROPERTY
The long-term physical location being maintained. The property is the strategic asset — everything that happens at a home accumulates here. This is the center of gravity for the platform.

**Owns:**
- Address and location metadata
- Jobs (all work associated with this address)
- Vault items (durable home facts)
- Property issues (tracked deficiencies)
- Property notes (free-form observations)
- Condition snapshots (scored assessments)
- Timeline view (derived from jobs, visits, vault, issues)
- Maintenance plan enrollment (via maintenance_plans → property link)

**Does NOT own:**
- Client contact details (those live on client)
- Billing/payment records (those roll up from invoices via jobs)

**Canonical name:** `property`

---

### JOB
The business commitment and customer-facing work thread. A job represents a discrete approved engagement with a client for a defined scope of work. It is the primary unit the owner thinks about from a business/financial perspective.

**Owns:**
- Work scope and title
- Internal lifecycle status (draft → quoted → scheduled → in_progress → completed → invoiced)
- Estimates (proposals for this job)
- Visits (scheduled appointments under this job)
- Invoices (collection for this job)
- Expenses (costs charged to this job)
- Intake/acceptance data (intake_decision, intake_rating, acceptance_category)
- Vendor coordination records
- Sub-status (soft signal: waiting_parts, customer_hold, dispute, quote_revision)

**Does NOT own:**
- Scheduling truth (that lives on visits.scheduled_start — `jobs.scheduled_start/end` are LEGACY fields, do not read)
- Property facts (those live on property)
- Payment processing state (that lives on invoices)

**Canonical name:** `job` (never "work order", "project", "ticket", or "task" in code/DB)

**Note:** "Work order" is acceptable as UI copy on the visit detail screen only — it is not a DB entity.

---

### VISIT
A scheduled technician execution event at a property. This is the primary unit the technician thinks about on the day of service.

**Owns:**
- Scheduling truth (scheduled_start, scheduled_end, arrived_at, completed_at)
- Visit status (scheduled → arrived → in_progress → completed | cancelled)
- Assigned technician
- Tech notes / field notes
- Checklist items (visit_checklist_items)
- Completion packet
- Parts used (visit_parts)
- Materials used (visit_materials)
- Media / photos (visit_media)
- Sub-status (soft signal: no_show, weather_hold, waiting_parts, reschedule_requested)
- Membership visit phase (health_check, included_action, reporting) — when applicable
- Time logs

**Does NOT own:**
- Pricing (that lives on estimates)
- Invoice generation (job drives that)
- Property vault content (vault is sourced from visit observations but owned by property)

**Canonical name:** `visit` (never "appointment", "service call", "work order", or "field event")

---

### BOOKING REQUEST
A raw inbound service request before acceptance review. Not a work object. It is intake evidence only.

**Owns:**
- Client contact info captured at inquiry time
- Requested service description
- Review state (new → reviewed → accepted | declined)
- Duplicate detection flag

**Does NOT own:**
- Job lifecycle state (convert creates a job; the booking request becomes read-only)
- Property record (that is created/linked during conversion)

**Canonical name:** `booking_request` (the intake screen says "New Intake" — that is fine as UI copy)

**Lifecycle:** `booking_request` → (accept) → `job` + `client` + `property` (created by conversion)

---

### ESTIMATE
A priced proposal for a job. The source of pricing truth for the engagement.

**Owns:**
- Line items (labor, materials, handling fees, adjustments)
- Status (draft → sent → approved | declined | expired)
- Change orders (amendments after approval)
- Guardrail state (pricing_review_status: needs_review, passed, blocked)
- Estimate options (alternative pricing tiers)
- Vault link (estimate can contribute facts to property vault)

**Does NOT own:**
- Job status (estimate approval triggers job status change, but estimate does not control it)
- Payment state (invoices handle that)

**Canonical name:** `estimate` (never "quote" in code/DB; "quote" is acceptable in UI copy)

---

### INVOICE
The collection record for completed or near-complete work.

**Owns:**
- Line items (billed amounts)
- Status (draft → sent → partial → paid | overdue | void)
- Payment records
- Deposit tracking
- Portal token (client-facing payment link)

**Does NOT own:**
- Pricing logic (that lives on estimates)
- Job lifecycle (invoice status does not automatically change job status)

**Canonical name:** `invoice`

---

### MEMBERSHIP (stored as `maintenance_plans`)
A recurring service enrollment for a client/property. Provides scheduled maintenance visits on a cadence.

**Owns:**
- Tier (essential | plus | premier)
- Billing cadence (annual | monthly)
- Renewal date
- Membership visits (visits linked to this plan)
- Add-ons (plan_addons / membership_addons)
- Routing zone
- Priority level
- Cap status

**Does NOT own:**
- Individual visit content (that lives on visits)
- Invoice records (billed separately)

**Canonical names:**
- DB table: `maintenance_plans` (do not rename — migration compatibility)
- Product language: **membership** (use this in all UI copy, API documentation, and new code)
- Add-ons: **membership addons** (code may still say `subscription_addons` — treat as alias, migrate gradually)

---

### PROPERTY VAULT (stored as `property_vault_items`)
Durable facts about a property's systems and materials. Grows over time through membership visits. This is the compound value that makes long-term membership defensible.

**Owns:**
- Item category (mechanical, appliance, filter, paint_finish, monitor, vendor, other)
- Item metadata (brand, model, serial, notes, next_service_date)
- Media attachments (photos)
- Estimate link (sourced from an estimate's scope)

**Does NOT own:**
- Visit content (vault is a snapshot pulled from visits, not live visit state)

**Canonical name:** `vault item` (UI: "Home Vault") — never "asset" in product copy. The `assets` table (Homebox integration) is a separate integration concept — do not conflate the two.

---

### PROPERTY ISSUE
A tracked deficiency or maintenance item observed at the property. Distinct from a job — an issue does not have billing attached. It is an observation that may eventually become a job.

**Owns:**
- Title and description
- Severity (low | medium | high)
- Status (open | resolved | deferred)
- Source (manual | visit_scan | auto)

**Does NOT own:**
- Job records (a job can reference an issue, but the issue does not own the job)

**Canonical name:** `property issue` (UI: "Issues")

---

### PRICE BOOK
The estimating input catalog. A library of standard service items with pricing that feeds the estimate engine.

**Owns:**
- Service item definitions (name, default price, category)
- Price modifiers

**Does NOT own:**
- Estimate state (price book feeds estimates; estimates are independent once created)
- Product taxonomy (price book items are not job types)

**Canonical name:** `price book`

---

### AUTOMATION RULE
A configurable business rule that fires on workflow events to perform actions (send notifications, update state, etc.).

**Canonical name:** `automation rule` (never "trigger", "workflow", or "rule" alone)

---

## Objects that do NOT exist

These concepts are sometimes mentioned in discussions but have no DB table and should not get one:

| Non-entity | What to use instead |
|---|---|
| Work order | Visit (detail screen can say "Work Order" in UI) |
| Service request | Booking request (intake) |
| Project | Job |
| Appointment | Visit |
| Contract | Estimate (approved) |
| Ticket | Job or Property Issue |
| Lead | Booking request |

---

## Scaffolded Tables (Not Yet Wired)

These tables exist in migrations but have no application code reading or writing them. They are retained for planned P7+ features and should not be dropped without a backlog decision.

| Table | Migration | Intended Use |
|---|---|---|
| `price_book_modifiers` | 052 | Per-account markup/discount rules on price book items |
| `pricing_rule_snapshots` | 061 | Point-in-time snapshots of pricing rules for audit/history |
