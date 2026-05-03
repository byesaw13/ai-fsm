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
// Trade-specific closing checklists
// Every template ends with universal closing steps (cleanup → secured).
// ---------------------------------------------------------------------------

function universal(offset: number): ChecklistTemplateItem[] {
  return [
    { section: "Closing", item_key: "close_cleanup",     label: "Work area cleaned and debris removed",     sort_order: offset },
    { section: "Closing", item_key: "close_photos",      label: "Before and after photos captured",         sort_order: offset + 1 },
    { section: "Closing", item_key: "close_parts",       label: "All parts documented with receipt",        sort_order: offset + 2 },
    { section: "Closing", item_key: "close_walkthrough", label: "Client walkthrough completed",             sort_order: offset + 3 },
    { section: "Closing", item_key: "close_approval",    label: "Client verbal approval received",          sort_order: offset + 4 },
    { section: "Closing", item_key: "close_secured",     label: "Property secured (doors, gates, garage)",  sort_order: offset + 5 },
  ];
}

export const CLOSING_CHECKLIST_TEMPLATES: Record<string, ChecklistTemplateItem[]> = {

  plumbing: [
    { section: "Closing", item_key: "plumb_no_leaks",      label: "All fixtures tested — no drips or leaks",           sort_order: 0 },
    { section: "Closing", item_key: "plumb_hot_cold",      label: "Hot and cold water running correctly",              sort_order: 1 },
    { section: "Closing", item_key: "plumb_drainage",      label: "Drainage flowing freely — no slow drains",          sort_order: 2 },
    { section: "Closing", item_key: "plumb_shutoffs",      label: "Shutoff valves exercised and operating",            sort_order: 3 },
    { section: "Closing", item_key: "plumb_no_moisture",   label: "No visible moisture or water damage remaining",     sort_order: 4 },
    { section: "Closing", item_key: "plumb_water_on",      label: "Main water supply verified on before leaving",      sort_order: 5 },
    ...universal(10),
  ],

  electrical: [
    { section: "Closing", item_key: "elec_outlets",        label: "All outlets and switches tested and functioning",   sort_order: 0 },
    { section: "Closing", item_key: "elec_breaker",        label: "Circuit breaker labeled if new circuit added",      sort_order: 1 },
    { section: "Closing", item_key: "elec_no_exposed",     label: "No exposed wiring visible",                        sort_order: 2 },
    { section: "Closing", item_key: "elec_gfci",           label: "GFCI outlets tested if applicable",                sort_order: 3 },
    { section: "Closing", item_key: "elec_covers",         label: "All covers and face plates reinstalled",            sort_order: 4 },
    { section: "Closing", item_key: "elec_smoke_co",       label: "Smoke/CO detectors tested near work area",         sort_order: 5 },
    ...universal(10),
  ],

  hvac: [
    { section: "Closing", item_key: "hvac_tested",         label: "System tested — heating/cooling confirmed working", sort_order: 0 },
    { section: "Closing", item_key: "hvac_thermostat",     label: "Thermostat set back to client preference",         sort_order: 1 },
    { section: "Closing", item_key: "hvac_filter",         label: "Filter replaced and old filter disposed",          sort_order: 2 },
    { section: "Closing", item_key: "hvac_condensate",     label: "Condensate drain checked and clear",               sort_order: 3 },
    { section: "Closing", item_key: "hvac_panels",         label: "All access panels reinstalled and secured",        sort_order: 4 },
    { section: "Closing", item_key: "hvac_vents",          label: "Vents and registers clear — not blocked",          sort_order: 5 },
    ...universal(10),
  ],

  carpentry: [
    { section: "Closing", item_key: "carp_fasteners",      label: "All fasteners driven, filled, and countersunk",    sort_order: 0 },
    { section: "Closing", item_key: "carp_trim_tight",     label: "Trim and moldings tight — no gaps",                sort_order: 1 },
    { section: "Closing", item_key: "carp_operation",      label: "Doors and drawers operate smoothly",               sort_order: 2 },
    { section: "Closing", item_key: "carp_hardware",       label: "Hardware installed and functioning",               sort_order: 3 },
    { section: "Closing", item_key: "carp_touchup",        label: "Paint/stain touch-up applied if needed",           sort_order: 4 },
    ...universal(10),
  ],

  painting: [
    { section: "Closing", item_key: "paint_edges",         label: "All edges and lines clean — no bleeding",          sort_order: 0 },
    { section: "Closing", item_key: "paint_dry",           label: "Final coat fully dry before handoff",              sort_order: 1 },
    { section: "Closing", item_key: "paint_covers",        label: "Outlet covers and switch plates reinstalled",      sort_order: 2 },
    { section: "Closing", item_key: "paint_furniture",     label: "Furniture and fixtures moved back",                sort_order: 3 },
    { section: "Closing", item_key: "paint_dropcloths",    label: "Drop cloths and tape removed and disposed",        sort_order: 4 },
    { section: "Closing", item_key: "paint_cans",          label: "Paint stored or disposed per client preference",   sort_order: 5 },
    ...universal(10),
  ],

  roofing: [
    { section: "Closing", item_key: "roof_secured",        label: "All shingles/materials secured — no loose edges",  sort_order: 0 },
    { section: "Closing", item_key: "roof_flashing",       label: "Flashing sealed and watertight",                   sort_order: 1 },
    { section: "Closing", item_key: "roof_debris",         label: "No nails or debris on lawn or driveway",           sort_order: 2 },
    { section: "Closing", item_key: "roof_gutters",        label: "Gutters cleared of roofing debris",                sort_order: 3 },
    { section: "Closing", item_key: "roof_interior",       label: "Interior checked for water intrusion signs",       sort_order: 4 },
    ...universal(10),
  ],

  flooring: [
    { section: "Closing", item_key: "floor_seams",         label: "All seams tight and transitions installed",        sort_order: 0 },
    { section: "Closing", item_key: "floor_gaps",          label: "Expansion gaps maintained at perimeter",           sort_order: 1 },
    { section: "Closing", item_key: "floor_squeaks",       label: "Floor tested — no squeaks or loose areas",         sort_order: 2 },
    { section: "Closing", item_key: "floor_cure",          label: "Client informed of adhesive/grout cure time",      sort_order: 3 },
    { section: "Closing", item_key: "floor_packaging",     label: "Debris and packaging removed",                     sort_order: 4 },
    ...universal(10),
  ],

  windows_doors: [
    { section: "Closing", item_key: "wd_operation",        label: "Window/door opens, closes, and locks correctly",   sort_order: 0 },
    { section: "Closing", item_key: "wd_weatherstrip",     label: "Weatherstripping seated and sealing properly",     sort_order: 1 },
    { section: "Closing", item_key: "wd_no_draft",         label: "No drafts felt around frame",                      sort_order: 2 },
    { section: "Closing", item_key: "wd_glass_clean",      label: "Glass cleaned — free of smudges and prints",       sort_order: 3 },
    { section: "Closing", item_key: "wd_hardware",         label: "Hardware functioning and all screws tightened",    sort_order: 4 },
    ...universal(10),
  ],

  appliances: [
    { section: "Closing", item_key: "appl_powered",        label: "Appliance powers on and tested through full cycle", sort_order: 0 },
    { section: "Closing", item_key: "appl_connections",    label: "All water/gas/electrical connections verified",    sort_order: 1 },
    { section: "Closing", item_key: "appl_level",          label: "Appliance leveled and secured in place",           sort_order: 2 },
    { section: "Closing", item_key: "appl_old_unit",       label: "Old appliance removed or noted as client's responsibility", sort_order: 3 },
    { section: "Closing", item_key: "appl_docs",           label: "Manufacturer documentation left with client",      sort_order: 4 },
    ...universal(10),
  ],

  drywall: [
    { section: "Closing", item_key: "dry_seams",           label: "All seams and fasteners taped, mudded, sanded smooth", sort_order: 0 },
    { section: "Closing", item_key: "dry_texture",         label: "Texture matched to existing wall (if applicable)", sort_order: 1 },
    { section: "Closing", item_key: "dry_primed",          label: "Primer coat applied — ready for paint",            sort_order: 2 },
    { section: "Closing", item_key: "dry_no_ridges",       label: "No visible ridges or bubbles",                     sort_order: 3 },
    { section: "Closing", item_key: "dry_dust",            label: "Drywall dust cleaned from all surfaces and floors", sort_order: 4 },
    ...universal(10),
  ],

  landscaping: [
    { section: "Closing", item_key: "land_depth",          label: "All plant material installed at correct depth",    sort_order: 0 },
    { section: "Closing", item_key: "land_mulch",          label: "Mulch or stone spread evenly",                    sort_order: 1 },
    { section: "Closing", item_key: "land_irrigation",     label: "Irrigation/drainage connections verified",        sort_order: 2 },
    { section: "Closing", item_key: "land_debris",         label: "All debris and packaging removed from site",      sort_order: 3 },
    { section: "Closing", item_key: "land_tools",          label: "Tools and equipment fully loaded out",            sort_order: 4 },
    ...universal(10),
  ],

  // Generic fallback for 'repair', 'custom', and any unknown types
  _default: universal(0),
};

/** Return the correct closing template for a given job type. */
export function getClosingTemplate(jobType: string): ChecklistTemplateItem[] {
  return CLOSING_CHECKLIST_TEMPLATES[jobType] ?? CLOSING_CHECKLIST_TEMPLATES._default;
}

/** Backwards-compat alias used by existing code. */
export const CLOSING_CHECKLIST_TEMPLATE = CLOSING_CHECKLIST_TEMPLATES._default;

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Insert a template into visit_checklist_items for a visit.
 * Uses ON CONFLICT DO NOTHING for idempotency — safe to call multiple times.
 */
export async function seedChecklistItems(
  client: PoolClient,
  accountId: string,
  visitId: string,
  template: ChecklistTemplateItem[] = DEFAULT_CHECKLIST_TEMPLATE
): Promise<void> {
  if (template.length === 0) return;

  // Build a multi-row INSERT to seed all items in one round-trip.
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const item of template) {
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
 * Return checklist items for a visit, seeding from the appropriate template if
 * no items exist yet.  The seed is idempotent — ON CONFLICT DO NOTHING.
 *
 * jobType === 'maintenance' (or undefined) → DEFAULT_CHECKLIST_TEMPLATE (28 items)
 * any other jobType → CLOSING_CHECKLIST_TEMPLATE (6 closing steps)
 */
export async function getOrSeedChecklist(
  client: PoolClient,
  accountId: string,
  visitId: string,
  jobType?: string
): Promise<VisitChecklistItem[]> {
  const isMaintenance = jobType === undefined || jobType === "maintenance";
  const template = isMaintenance ? DEFAULT_CHECKLIST_TEMPLATE : getClosingTemplate(jobType!);

  // Detect wrong-type seeds: maintenance visits should have walkthrough sections,
  // non-maintenance visits should have a Closing section.
  const existingResult = await client.query<{ section: string }>(
    `SELECT DISTINCT section FROM visit_checklist_items WHERE visit_id = $1 AND account_id = $2`,
    [visitId, accountId]
  );
  const existingSections = existingResult.rows.map((r) => r.section);
  const hasClosing = existingSections.includes("Closing");
  const hasWalkthrough = existingSections.some((s) => s !== "Closing");
  const wrongType =
    existingSections.length > 0 &&
    ((isMaintenance && hasClosing && !hasWalkthrough) ||
     (!isMaintenance && hasWalkthrough));

  if (wrongType) {
    // Clear and re-seed with correct template
    await client.query(
      `DELETE FROM visit_checklist_items WHERE visit_id = $1 AND account_id = $2`,
      [visitId, accountId]
    );
    await seedChecklistItems(client, accountId, visitId, template);
  } else if (existingSections.length === 0) {
    await seedChecklistItems(client, accountId, visitId, template);
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
