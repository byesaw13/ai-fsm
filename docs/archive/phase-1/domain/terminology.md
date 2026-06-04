# Terminology — Dovetails Services LLC

> Canonical names, aliases, deprecated terms, and UI-vs-code conventions.
> When you're not sure what to call something, this file answers first.
> Last updated: 2026-05-16

---

## Canonical Term Reference

| Canonical term | DB table / column | UI copy allowed | Deprecated / do not use |
|---|---|---|---|
| **client** | `clients` | "Client", "Homeowner" (UI only) | customer, contact, account holder |
| **property** | `properties` | "Property", "Home" (UI only) | location, site, address |
| **job** | `jobs` | "Job", "Project" (UI only) | work order, ticket, request, task |
| **visit** | `visits` | "Visit", "Work Order" (detail screen only) | appointment, service call, field event |
| **booking request** | `booking_requests` | "Intake", "Request" | lead, inquiry, service request |
| **estimate** | `estimates` | "Estimate", "Quote" (UI only) | proposal, bid |
| **invoice** | `invoices` | "Invoice" | bill, statement |
| **membership** | `maintenance_plans` | "Membership", "Maintenance Plan" (UI) | subscription, service contract |
| **membership addon** | `plan_addons` / `subscription_addons` | "Add-on" | subscription addon (migrate toward membership_addon in new code) |
| **vault item** | `property_vault_items` | "Home Vault", "Vault" | asset (reserve "asset" for Homebox integration only) |
| **property issue** | `property_issues` | "Issues", "Deficiency" | defect, punch list item |
| **price book** | `price_book` | "Price Book" | service catalog, rate sheet |
| **automation rule** | `automation_rules` | "Automation" | trigger, workflow, rule |
| **change order** | `change_orders` | "Change Order" | amendment, revision (use "revision" for estimate revisions before approval) |
| **completion packet** | `completion_packets` | "Visit Summary" (UI) | closeout, signoff |

---

## Naming Drift Tracker

These terms currently exist in code or DB with inconsistent naming. Resolve gradually — do not do mass-renames without migration planning.

| Drifted term | Where it appears | Canonical target | Migration status |
|---|---|---|---|
| `maintenance_plan` / `subscription` | Table: `maintenance_plans`; code: mixed | product language: **membership** | Table stays; add `membership` as UI label everywhere |
| `subscription_addons` | `plan_addons` join table column | `membership_addons` | Rename in code when touching this area |
| `plan_template` | `plan_templates` table | `membership template` (product) | Table stays; use "membership template" in UI |
| `intake` | Route `/intake/new` and `createIntakeRecords()` | "New Booking" or "New Intake" | Both are acceptable in UI; keep function name |
| `pipeline` | Route `/app/pipeline`, `pipeline/stages.ts` | Now `packages/domain/src/stages.ts` | File moved; remove old path if it still exists |
| `assets` | `assets` table (Homebox integration) | Integration-specific only | Do not use "asset" for vault items in UI |
| `work_order` | Referenced in some UI copy | Visit detail screen only | Acceptable as UI label on `/visits/[id]` only |
| `realtor_baseline` | `JOB_ACCEPTANCE_CATEGORIES` | Keep; is a strategic category | No change needed |

---

## UI Copy vs. Code Conventions

UI can use friendlier language. Code and DB must use canonical names.

### Allowed UI substitutions

| Canonical (code/DB) | Friendly UI copy |
|---|---|
| `client` | "Homeowner" (property context), "Client" (billing context) |
| `job` | "Project" (on job list page), "Job" (everywhere else) |
| `visit` | "Work Order" (on visit detail page only) |
| `booking_request` | "Intake" (nav), "New Request" (form title) |
| `estimate` | "Quote" (portal-facing), "Estimate" (internal) |
| `maintenance_plan` | "Membership Plan", "Membership" |
| `property_vault_items` | "Home Vault", "Vault" |
| `completion_packet` | "Visit Summary", "Closeout Summary" |

### Never substitute in code

- Do not use "appointment" anywhere — it implies consumer scheduling software
- Do not use "ticket" anywhere — it implies a helpdesk model
- Do not use "subscription" for membership — it implies SaaS billing
- Do not use "asset" for vault items — reserved for Homebox integration

---

## Status Term Conventions

### Internal statuses (DB / code)

Use snake_case exactly as defined in the CHECK constraint. Example: `in_progress`, not `inProgress` or `In Progress`.

### Presentation statuses (UI)

Title-case the CustomerStage label. Example: "Scheduled", not "scheduled" or "SCHEDULED".

### Sub-statuses (UI display)

Use the label from `SUB_STATUS_LABELS` in `packages/domain/src/sub-statuses.ts`. Example: "Waiting Parts", not "waiting_parts".

---

## Membership-Specific Terminology

| Term | Definition |
|---|---|
| **Essential** | 1 visit/year tier |
| **Plus** | 2 visits/year tier |
| **Premier** | 4 visits/year tier |
| **Health check** | First phase of a membership visit — structured walkthrough |
| **Included action** | Second phase — up to 60 min included repair/maintenance |
| **Reporting** | Third phase — vault and issue documentation |
| **Cap status** | Whether the membership has hit its included-labor ceiling |
| **Routing zone** | Geographic classification: core, extended, out_of_area |
| **Priority level** | Scheduling priority: standard, priority, VIP |

---

## Dovetails Brand Positioning Terms

These are intentional product positioning choices — use consistently in client-facing copy:

| Term | Meaning | Use in |
|---|---|---|
| **Stewardship** | Long-term care of a property | Marketing, portal, membership onboarding |
| **Property Memory** | The accumulation of home knowledge in the vault | Portal, membership pitch |
| **Trusted Maintenance Partner** | How Dovetails positions vs. one-off contractors | Marketing |
| **Home Vault** | The vault item collection | Portal, client-facing |
| **Preventative Care** | Proactive maintenance focus | Membership pitch, visit summaries |

Do not use: "dispatch", "contractor", "ticket", "helpdesk", "pipeline" in any client-facing copy.
