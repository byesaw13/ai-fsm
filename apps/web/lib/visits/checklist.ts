/**
 * Visit checklist template and seeding helpers.
 *
 * Implements the Master Health Check Checklist from the Dovetail Home Services
 * Growth & Operations Playbook v1.2 — sections B.5 (Visit Flow), B.9
 * (Documentation Requirements), and 4.2 (Master Health Check Checklist).
 *
 * 28 items across 6 ordered sections.  Items are idempotently seeded into
 * visit_checklist_items on the first GET request for a visit.
 */

import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import type { VisitChecklistItem } from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// RLS context helper (mirrors withExpenseContext / withDocumentContext)
// ---------------------------------------------------------------------------

export async function withChecklistContext<T>(
  session: SessionPayload,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [session.userId]);
    await client.query("SELECT set_config('app.current_account_id', $1, true)", [session.accountId]);
    await client.query("SELECT set_config('app.current_role', $1, true)", [session.role]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Default checklist template — 28 items, 6 sections, SOP order
// ---------------------------------------------------------------------------

export interface ChecklistTemplateItem {
  section: string;
  item_key: string;
  label: string;
  sort_order: number;
}

export const DEFAULT_CHECKLIST_TEMPLATE: ChecklistTemplateItem[] = [
  // Exterior (7)
  { section: "Exterior", item_key: "ext_roof_condition",        label: "Roof condition (visible)",    sort_order: 0 },
  { section: "Exterior", item_key: "ext_gutters_downspouts",    label: "Gutters & downspouts",        sort_order: 1 },
  { section: "Exterior", item_key: "ext_siding_paint",          label: "Siding / paint condition",    sort_order: 2 },
  { section: "Exterior", item_key: "ext_windows_caulking",      label: "Windows & caulking",          sort_order: 3 },
  { section: "Exterior", item_key: "ext_foundation_visible",    label: "Foundation (visible)",        sort_order: 4 },
  { section: "Exterior", item_key: "ext_driveway_walkway",      label: "Driveway & walkways",         sort_order: 5 },
  { section: "Exterior", item_key: "ext_landscaping_drainage",  label: "Landscaping & drainage",      sort_order: 6 },

  // Interior — Living Areas (5)
  { section: "Interior — Living Areas", item_key: "int_ceiling_walls",       label: "Ceilings & walls",         sort_order: 0 },
  { section: "Interior — Living Areas", item_key: "int_floors",              label: "Floors & baseboards",      sort_order: 1 },
  { section: "Interior — Living Areas", item_key: "int_windows_interior",    label: "Windows (interior)",       sort_order: 2 },
  { section: "Interior — Living Areas", item_key: "int_doors_hardware",      label: "Doors & hardware",         sort_order: 3 },
  { section: "Interior — Living Areas", item_key: "int_smoke_co_detectors",  label: "Smoke / CO detectors",     sort_order: 4 },

  // Kitchen (4)
  { section: "Kitchen", item_key: "kit_appliances",        label: "Appliances",              sort_order: 0 },
  { section: "Kitchen", item_key: "kit_cabinets_counters", label: "Cabinets & countertops",  sort_order: 1 },
  { section: "Kitchen", item_key: "kit_sink_plumbing",     label: "Sink & plumbing",         sort_order: 2 },
  { section: "Kitchen", item_key: "kit_ventilation",       label: "Ventilation / range hood",sort_order: 3 },

  // Bathrooms (5)
  { section: "Bathrooms", item_key: "bath_toilet",      label: "Toilet",           sort_order: 0 },
  { section: "Bathrooms", item_key: "bath_sink_vanity", label: "Sink & vanity",    sort_order: 1 },
  { section: "Bathrooms", item_key: "bath_tub_shower",  label: "Tub / shower",     sort_order: 2 },
  { section: "Bathrooms", item_key: "bath_caulk_grout", label: "Caulk & grout",    sort_order: 3 },
  { section: "Bathrooms", item_key: "bath_ventilation", label: "Ventilation fan",  sort_order: 4 },

  // Basement / Utility / Mechanical (4)
  { section: "Basement / Utility / Mechanical", item_key: "mech_hvac",              label: "HVAC / furnace / AC",       sort_order: 0 },
  { section: "Basement / Utility / Mechanical", item_key: "mech_water_heater",      label: "Water heater",              sort_order: 1 },
  { section: "Basement / Utility / Mechanical", item_key: "mech_electrical_panel",  label: "Electrical panel",          sort_order: 2 },
  { section: "Basement / Utility / Mechanical", item_key: "mech_plumbing_visible",  label: "Plumbing (visible)",        sort_order: 3 },

  // Attic / Upper Areas (3)
  { section: "Attic / Upper Areas", item_key: "attic_insulation",  label: "Insulation",                    sort_order: 0 },
  { section: "Attic / Upper Areas", item_key: "attic_ventilation", label: "Ventilation",                   sort_order: 1 },
  { section: "Attic / Upper Areas", item_key: "attic_structure",   label: "Structural framing (visible)",  sort_order: 2 },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Insert the default template for a visit.
 * Uses ON CONFLICT DO NOTHING for idempotency — safe to call multiple times.
 */
export async function seedChecklistItems(
  client: PoolClient,
  accountId: string,
  visitId: string
): Promise<void> {
  if (DEFAULT_CHECKLIST_TEMPLATE.length === 0) return;

  // Build a multi-row INSERT to seed all 28 items in one round-trip.
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const item of DEFAULT_CHECKLIST_TEMPLATE) {
    placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
    values.push(accountId, visitId, item.section, item.item_key, item.label, item.sort_order);
    i += 6;
  }

  await client.query(
    `INSERT INTO visit_checklist_items
       (account_id, visit_id, section, item_key, label, sort_order)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (visit_id, item_key) DO NOTHING`,
    values
  );
}

// ---------------------------------------------------------------------------
// Get-or-seed (idempotent read with lazy seeding)
// ---------------------------------------------------------------------------

/**
 * Return checklist items for a visit, seeding from the default template if
 * no items exist yet.  The seed is idempotent — ON CONFLICT DO NOTHING.
 */
export async function getOrSeedChecklist(
  client: PoolClient,
  accountId: string,
  visitId: string
): Promise<VisitChecklistItem[]> {
  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM visit_checklist_items WHERE visit_id = $1 AND account_id = $2`,
    [visitId, accountId]
  );

  const count = parseInt(countResult.rows[0]?.count ?? "0", 10);

  if (count === 0) {
    await seedChecklistItems(client, accountId, visitId);
  }

  const { rows } = await client.query<VisitChecklistItem>(
    `SELECT id, account_id, visit_id, section, item_key, label,
            disposition, note, sort_order, created_at, updated_at
     FROM visit_checklist_items
     WHERE visit_id = $1 AND account_id = $2
     ORDER BY section, sort_order, item_key`,
    [visitId, accountId]
  );

  return rows;
}

// ---------------------------------------------------------------------------
// Update a single checklist item
// ---------------------------------------------------------------------------

/**
 * Update disposition and/or note on a single checklist item.
 * Returns the updated row, or null if not found.
 */
export async function updateChecklistItem(
  client: PoolClient,
  accountId: string,
  visitId: string,
  itemId: string,
  patch: { disposition?: string | null; note?: string | null }
): Promise<VisitChecklistItem | null> {
  const fields: string[] = [];
  const values: unknown[] = [itemId, visitId, accountId];
  let idx = 4;

  if (patch.disposition !== undefined) {
    fields.push(`disposition = $${idx++}`);
    values.push(patch.disposition);
  }
  if (patch.note !== undefined) {
    fields.push(`note = $${idx++}`);
    values.push(patch.note);
  }

  if (fields.length === 0) return null;

  const { rows } = await client.query<VisitChecklistItem>(
    `UPDATE visit_checklist_items
     SET ${fields.join(", ")}, updated_at = now()
     WHERE id = $1 AND visit_id = $2 AND account_id = $3
     RETURNING id, account_id, visit_id, section, item_key, label,
               disposition, note, sort_order, created_at, updated_at`,
    values
  );

  return rows[0] ?? null;
}
