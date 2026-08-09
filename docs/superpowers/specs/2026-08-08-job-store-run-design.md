# TASK-101: Guided Job Store Run

## Objective

Turn the existing job-owned materials buy list into a fast, supplier-specific
store run. The field user chooses one supplier, follows a department route
ordered by known aisle numbers, marks each item purchased with one tap, and
finishes with a summary linked to the existing receipt-upload flow.

The job buy list remains the single source of operational purchasing truth.
Store Run is a temporary focused view, not a new persistent business record.

## Scope

### Included

- Start Store Run from `/app/jobs/[id]/materials`.
- Choose one supplier and its account-level preferred branch.
- Include the selected supplier's needed items plus unassigned needed items.
- Group items into department stops.
- Order stops by their lowest known numeric aisle; unknown locations come last.
- Show aisle and optional bay when known.
- Mark an item `purchased` with one tap and offer Undo.
- Show an explicit next-department button after the current stop is complete.
- Show a completion summary for this browser session.
- Link to the existing expense/receipt form with the job preselected.
- Remember aisle and bay for future catalog-backed items when requested.

### Excluded

- Persistent store-run records or history.
- Cross-job purchasing runs.
- Automatic receipt-to-buy-list reconciliation.
- Live supplier inventory, pricing, aisle, or ordering APIs.
- Route optimization beyond numeric aisle ordering.
- AI-generated aisle or bay values.

## Architecture

The existing flow remains one-way:

`Estimate shopping list -> Job buy list -> Receipt/expense actuals`

- Estimate `shopping_list_json` is planning input.
- `job_material_lines` is the mutable operational buy list.
- Expense and receipt line items are purchase actuals.
- Store Run reads and updates `job_material_lines` through the existing job
  materials API.
- No store-run table, API resource, or state machine is introduced.

Temporary browser state contains the selected supplier, current department,
the IDs of items purchased during the session, and the starting estimated
total. A reload preserves persisted item statuses but resets route position and
the session-only completion summary.

## Field Workflow

### 1. Launch

The job buy list shows **Start Store Run**. Starting a run takes no more than
two taps: launch, then confirm or choose the supplier.

The supplier picker defaults to the account's preferred branch for that
supplier. It shows suppliers already assigned to needed items plus Home Depot,
Lowe's, and Supply House.

### 2. Route overview

The overview shows department stops in walking order. Each stop displays its
department, aisle or aisle range when known, and remaining item count.

Ordering rules are deterministic:

1. Stops with known numeric aisles, ascending.
2. Items sharing an aisle remain together.
3. Department-only items follow known aisles.
4. Unassigned or unknown-location items appear in **Unknown Location** last.

### 3. Department stop

Each item row provides:

- A large purchase checkbox.
- Item name, quantity, and pack or unit.
- Aisle and optional bay.
- A small **Edit location** action.

Tapping the checkbox persists `status = 'purchased'` immediately and removes
the item from the active stop. A short-lived Undo action restores `needed`.

After the final item is purchased, the screen stays in place and presents a
large explicit action such as **Next: Fasteners - Aisle 13**. It never
auto-navigates after a purchase.

### 4. Completion

The completion screen shows:

- Items purchased during this browser session.
- Items still needed.
- Estimated purchased total only when all included purchased items have known
  prices. Resolve cost through `catalog_material_id` and the existing materials
  price book; job lines without a catalog price make the total incomplete.
- **Upload Receipt**, opening the existing expense form with the job selected.
- **Back to Job**.

## Data Model

### Job material snapshot

Add nullable fields to `job_material_lines`:

- `supplier`
- `aisle`
- `bay`

These values are the job-specific purchasing snapshot. Existing rows remain
valid with null values.

### Preferred supplier branch

Add `account_supplier_preferences`, unique by account and normalized supplier,
with:

- Supplier name.
- Branch label.
- Address.

The schema need not support multiple branches per supplier in this version.

### Catalog location memory

Add nullable text `aisle` and `bay` fields to `materials_price_book`. A
catalog-backed job line copies supplier, aisle, and bay when created. Route
ordering uses the leading integer in `aisle`; nonnumeric values remain visible
but sort with department-only locations after numeric aisles.

Editing a job line's location always updates the job snapshot. When the line is
catalog-backed, the UI offers **Remember for future jobs** to update the catalog
record as well. AI generation may populate a department but must leave aisle
and bay null unless those values come from stored catalog data.

## Components

Extend the existing job materials surface with four focused components:

- `StoreRunLauncher`: supplier and preferred-branch selection.
- `StoreRunRoute`: ordered department overview.
- `StoreRunDepartment`: purchase rows, Undo, and location edits.
- `StoreRunSummary`: session results and receipt link.

Place pure filtering, aisle parsing, route ordering, and summary calculations
in the existing job buy-list helper module. Continue using the existing job
materials routes for reads and item updates.

## Permissions

Use the current job-material access rules:

- Owner and admin may edit item details and remembered locations.
- An assigned technician may view the run and change item status.
- A technician may not change account-level preferred branches or catalog
  location memory.
- Every read and write remains account- and job-scoped.

## Error Handling

- Persist purchases per item rather than batching the whole department.
- Disable only the item currently being updated.
- If an update fails, leave the item needed and show a retry action.
- Refresh the buy list at department boundaries and before completion so
  changes from another device are reflected.
- Omit estimated totals when any required cost is unknown; never coerce unknown
  prices to zero.
- If the receipt form cannot accept a job query parameter, add only that
  preselection behavior rather than creating a second receipt flow.

## Testing

- Pure unit test covering supplier filtering, numeric aisle ordering, unknown
  location ordering, and session summary totals.
- API tests covering status and location updates, account isolation, role
  permissions, and catalog-memory opt-in.
- One mobile smoke flow: select supplier, purchase items, advance departments,
  finish, and open receipt upload with the job selected.
- Regression coverage confirming estimate seeding, manual additions,
  `on_truck`, and `not_needed` behavior remain intact.

## Acceptance Criteria

- A Store Run starts within two taps from a job buy list.
- Only the selected supplier's needed items and unassigned needed items appear.
- Known aisles are visited in ascending numeric order.
- Department-only and unknown-location items appear after known aisles.
- One tap persists `purchased` without blocking the entire route.
- Completing a department presents an explicit next-stop action.
- Location edits can optionally be remembered for future catalog-backed items.
- Completion reports purchased and still-needed items from the current session.
- Estimated spend is hidden when incomplete.
- Receipt upload opens with the current job preselected.
- No persistent Store Run entity or history is created.

## Follow-up Triggers

Add persistent store-run records only when interrupted-run recovery or an audit
history is demonstrated to matter. Add multi-branch aisle storage only when the
business regularly shops multiple branches of the same supplier. Add receipt
reconciliation separately, beginning with exact SKU matches and explicit user
confirmation.
