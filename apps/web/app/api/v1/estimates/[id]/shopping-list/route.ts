import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { computeMaterials, groupMaterialsBySection } from "@ai-fsm/domain";
import type { ServiceMaterial, ScopeComponentValues, ComplexityValues } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface SnapshotRow {
  id: string;
  category: string;
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
export const GET = withAuth(async (request: NextRequest, session) => {
  // pathname: /api/v1/estimates/<id>/shopping-list → [-2] = id
  const estimateId = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    // Verify estimate belongs to account
    const [estimateRows] = await Promise.all([
      query<{ id: string; client_id: string }>(
        `SELECT id, client_id FROM estimates WHERE id = $1 AND account_id = $2`,
        [estimateId, session.accountId]
      ),
    ]);
    if (estimateRows.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found" } },
        { status: 404 }
      );
    }

    // Load scope snapshots for this estimate
    const snapshots = await query<SnapshotRow>(
      `SELECT id, category, components, complexity
       FROM estimate_scope_snapshots
       WHERE estimate_id = $1
       ORDER BY created_at ASC`,
      [estimateId]
    );

    if (snapshots.length === 0) {
      return NextResponse.json({ sections: [], materialTotalCents: 0 });
    }

    // Load service materials for all categories in the snapshots
    const categories = [...new Set(snapshots.map((s) => s.category).filter(Boolean))];
    if (categories.length === 0) {
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
    const allComputed = snapshots.flatMap((snap) => {
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
    const materialTotalCents = deduplicated.reduce((sum, i) => sum + i.total_cost_cents, 0);

    return NextResponse.json({ sections, materialTotalCents });
  } catch (error) {
    logger.error("[shopping-list GET]", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load shopping list", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
