import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { shoppingListToMaterialsBySection } from "@/lib/estimates/shopping-list-display";
import {
  computeMaterials,
  groupMaterialsBySection,
  computeDoorHardwareTakeoff,
  mergeDoorHardwareTakeoffIntoShoppingList,
  includesDoorHardwareCode,
  priceBookCodesFromLineRows,
  serviceCodesForSnapshots,
  DOOR_HARDWARE_PRICE_BOOK_CODE,
  type ShoppingList,
} from "@ai-fsm/domain";
import type { ServiceMaterial, ScopeComponentValues, ComplexityValues } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface SnapshotRow {
  id: string;
  category: string;
  service_code: string | null;
  components: ScopeComponentValues;
  complexity: ComplexityValues;
  [key: string]: unknown;
}

interface MaterialRow {
  id: string;
  price_book_id: string | null;
  category: string | null;
  material_name: string;
  description: string | null;
  quantity_type: ServiceMaterial["quantity_type"];
  scope_component_key: string | null;
  quantity_multiplier: number | null;
  quantity_flat: number | null;
  waste_factor: number;
  unit: string;
  unit_cost_cents: number;
  store_section: string;
  is_consumable: boolean;
  is_optional: boolean;
  condition_factor_key: string | null;
  sort_order: number;
  [key: string]: unknown;
}

// GET /api/v1/estimates/[id]/shopping-list
// Returns computed materials grouped by store section for all scope snapshots on this estimate.
// TASK-101: also merges deterministic door-hardware (1007) takeoff when line items include that code.
export const GET = withAuth(async (request: NextRequest, session) => {
  // pathname: /api/v1/estimates/<id>/shopping-list → [-2] = id
  const estimateId = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    // Verify estimate belongs to account
    const [estimateRows] = await Promise.all([
      query<{ id: string; client_id: string; shopping_list_json: ShoppingList | null }>(
        `SELECT id, client_id, shopping_list_json FROM estimates WHERE id = $1 AND account_id = $2`,
        [estimateId, session.accountId]
      ),
    ]);
    if (estimateRows.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found" } },
        { status: 404 }
      );
    }

    const saved = estimateRows[0].shopping_list_json;
    if (saved?.sections?.length) {
      return NextResponse.json({
        sections: shoppingListToMaterialsBySection(saved),
        materialTotalCents:
          saved.total_catalog_cost_cents + saved.total_specified_cost_cents,
      });
    }

    // One code per persisted line: joined price-book identity wins over description fallback.
    const lineRows = await query<{ code: string | null; category: string | null; description: string | null }>(
      `SELECT pb.code, pb.category, eli.description
       FROM estimate_line_items eli
       LEFT JOIN price_book pb ON pb.id = eli.price_book_id
       WHERE eli.estimate_id = $1
       ORDER BY eli.sort_order ASC NULLS LAST`,
      [estimateId],
    );
    const allCodes = priceBookCodesFromLineRows(lineRows);
    const has1007 = includesDoorHardwareCode(allCodes);

    // Load scope snapshots for this estimate
    const snapshots = await query<SnapshotRow>(
      `SELECT ess.id, ess.category, ess.components, ess.complexity, pb.code AS service_code
       FROM estimate_scope_snapshots ess
       LEFT JOIN estimate_line_items eli ON eli.id = ess.estimate_line_item_id
       LEFT JOIN price_book pb ON pb.id = eli.price_book_id
       WHERE ess.estimate_id = $1
       ORDER BY ess.created_at ASC`,
      [estimateId]
    );

    const snapshotCodes = serviceCodesForSnapshots(snapshots, lineRows);

    if (snapshots.length === 0) {
      if (has1007) {
        const unitCount = Math.max(
          1,
          allCodes.filter((c) => c === DOOR_HARDWARE_PRICE_BOOK_CODE).length,
        );
        const takeoff = computeDoorHardwareTakeoff({
          hardwareType: "lockset",
          unitCount,
          customerSupplied: false,
        });
        const list = mergeDoorHardwareTakeoffIntoShoppingList(null, takeoff);
        return NextResponse.json({
          sections: shoppingListToMaterialsBySection(list),
          materialTotalCents: list.total_specified_cost_cents + list.total_catalog_cost_cents,
          takeoffWarnings: takeoff.warnings,
        });
      }
      return NextResponse.json({ sections: [], materialTotalCents: 0 });
    }

    const categories = [...new Set(snapshots.map((s) => s.category).filter(Boolean))];
    if (categories.length === 0) {
      if (has1007) {
        const unitCount = Math.max(
          1,
          allCodes.filter((c) => c === DOOR_HARDWARE_PRICE_BOOK_CODE).length,
        );
        const takeoff = computeDoorHardwareTakeoff({
          hardwareType: "lockset",
          unitCount,
          customerSupplied: false,
        });
        const list = mergeDoorHardwareTakeoffIntoShoppingList(null, takeoff);
        return NextResponse.json({
          sections: shoppingListToMaterialsBySection(list),
          materialTotalCents: list.total_specified_cost_cents + list.total_catalog_cost_cents,
          takeoffWarnings: takeoff.warnings,
        });
      }
      return NextResponse.json({ sections: [], materialTotalCents: 0 });
    }
    const catPlaceholders = categories.map((_, i) => `$${i + 1}`).join(", ");

    const materialRows = await query<MaterialRow>(
      `SELECT id, price_book_id, category, material_name, description,
              quantity_type, scope_component_key,
              quantity_multiplier::float, quantity_flat::float,
              waste_factor::float, unit, unit_cost_cents,
              store_section, is_consumable, is_optional,
              condition_factor_key, sort_order
       FROM service_materials
       WHERE category IN (${catPlaceholders})
       ORDER BY category, sort_order ASC`,
      categories
    );

    const serviceMaterials: ServiceMaterial[] = materialRows.map((m) => ({
      id: m.id,
      price_book_id: m.price_book_id,
      category: m.category,
      material_name: m.material_name,
      description: m.description,
      quantity_type: m.quantity_type,
      scope_component_key: m.scope_component_key,
      quantity_multiplier: m.quantity_multiplier,
      quantity_flat: m.quantity_flat,
      waste_factor: m.waste_factor,
      unit: m.unit,
      unit_cost_cents: m.unit_cost_cents,
      store_section: m.store_section,
      is_consumable: m.is_consumable,
      is_optional: m.is_optional,
      condition_factor_key: m.condition_factor_key,
      sort_order: m.sort_order,
    }));

    // Compute materials for each snapshot and aggregate
    const allComputed = snapshots.flatMap((snap, index) => {
      if (snapshotCodes[index] === DOOR_HARDWARE_PRICE_BOOK_CODE) return [];
      const categoryMaterials = serviceMaterials.filter((m) => m.category === snap.category);
      return computeMaterials(categoryMaterials, snap.components ?? {}, snap.complexity ?? {});
    });

    // Merge duplicate materials (same id) by summing quantities
    const merged = new Map<string, { quantity: number; total_cost_cents: number; material: ServiceMaterial }>();
    for (const item of allComputed) {
      const existing = merged.get(item.material.id);
      if (existing) {
        existing.quantity += item.quantity;
        existing.total_cost_cents += item.total_cost_cents;
      } else {
        merged.set(item.material.id, {
          quantity: item.quantity,
          total_cost_cents: item.total_cost_cents,
          material: item.material,
        });
      }
    }

    const deduplicated = Array.from(merged.values()).map((v) => ({
      material: v.material,
      quantity: Math.ceil(v.quantity),
      total_cost_cents: Math.round(Math.ceil(v.quantity) * v.material.unit_cost_cents),
    }));

    const sections = groupMaterialsBySection(deduplicated);
    let materialTotalCents = deduplicated.reduce((sum, i) => sum + i.total_cost_cents, 0);

    // TASK-101: merge 1007 door hardware kit into response when estimate includes code
    if (has1007) {
      const unitCount = Math.max(
        1,
        allCodes.filter((c) => c === DOOR_HARDWARE_PRICE_BOOK_CODE).length,
      );
      const takeoff = computeDoorHardwareTakeoff({
        hardwareType: "lockset",
        unitCount,
        customerSupplied: false,
      });
      // Adapt API section shape into ShoppingList for merge, then return merge result
      const asList: ShoppingList = {
        sections: sections.map((sec) => ({
          section: sec.section,
          computed_items: (sec.items ?? []).map((it: { material: ServiceMaterial; quantity: number; total_cost_cents: number }) => ({
            material: it.material,
            quantity: it.quantity,
            total_cost_cents: it.total_cost_cents,
          })),
          specified_items: [],
          section_total_cents: 0,
        })),
        total_catalog_cost_cents: materialTotalCents,
        total_specified_cost_cents: 0,
        generated_at: new Date().toISOString(),
      };
      const merged = mergeDoorHardwareTakeoffIntoShoppingList(asList, takeoff);
      materialTotalCents =
        merged.total_catalog_cost_cents + merged.total_specified_cost_cents;
      return NextResponse.json({
        sections: shoppingListToMaterialsBySection(merged),
        materialTotalCents,
        takeoffWarnings: takeoff.warnings,
      });
    }

    return NextResponse.json({ sections, materialTotalCents });
  } catch (error) {
    logger.error("[shopping-list GET]", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load shopping list", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
