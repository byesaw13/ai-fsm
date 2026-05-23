import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { computeMaterials, groupMaterialsBySection } from "@ai-fsm/domain";
import type { ServiceMaterial, ScopeComponentValues, ComplexityValues, MaterialsBySection } from "@ai-fsm/domain";
import { PrintButton } from "../print/PrintButton";

export const dynamic = "force-dynamic";

interface EstimateRow {
  id: string;
  client_name: string | null;
  client_email: string | null;
  created_at: string;
  [key: string]: unknown;
}

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

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function ShoppingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id: estimateId } = await params;

  const [estimateRows, snapshotRows] = await Promise.all([
    query<EstimateRow>(
      `SELECT e.id, c.name AS client_name, c.email AS client_email, e.created_at
       FROM estimates e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [estimateId, session.accountId]
    ),
    query<SnapshotRow>(
      `SELECT id, category, components, complexity
       FROM estimate_scope_snapshots
       WHERE estimate_id = $1
       ORDER BY created_at ASC`,
      [estimateId]
    ),
  ]);

  if (estimateRows.length === 0) notFound();
  const estimate = estimateRows[0];

  let sections: MaterialsBySection[] = [];
  let materialTotalCents = 0;

  if (snapshotRows.length > 0) {
    const categories = [...new Set(snapshotRows.map((s) => s.category).filter(Boolean))];

    if (categories.length > 0) {
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

      const allComputed = snapshotRows.flatMap((snap) => {
        const mats = serviceMaterials.filter((m) => m.category === snap.category);
        return computeMaterials(mats, snap.components ?? {}, snap.complexity ?? {});
      });

      // Merge duplicates by material ID
      const merged = new Map<string, { quantity: number; total_cost_cents: number; material: ServiceMaterial }>();
      for (const item of allComputed) {
        const existing = merged.get(item.material.id);
        if (existing) {
          existing.quantity += item.quantity;
          existing.total_cost_cents += item.total_cost_cents;
        } else {
          merged.set(item.material.id, { ...item });
        }
      }

      const deduplicated = Array.from(merged.values()).map((v) => ({
        material: v.material,
        quantity: Math.ceil(v.quantity),
        total_cost_cents: Math.round(Math.ceil(v.quantity) * v.material.unit_cost_cents),
      }));

      sections = groupMaterialsBySection(deduplicated);
      materialTotalCents = deduplicated.reduce((sum, i) => sum + i.total_cost_cents, 0);
    }
  }

  const createdDate = new Date(estimate.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "var(--space-6) var(--space-4)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "var(--space-6)",
          gap: "var(--space-4)",
        }}
        className="no-print"
      >
        <div>
          <a
            href={`/app/estimates/${estimateId}`}
            style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", textDecoration: "none" }}
          >
            ← Back to estimate
          </a>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "var(--space-1) 0 0" }}>
            Shopping List
          </h1>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            {estimate.client_name ?? "Client"} · {createdDate}
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Print header */}
      <div className="print-only" style={{ marginBottom: "var(--space-4)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: 0 }}>Materials Shopping List</h1>
        <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {estimate.client_name ?? "Client"} · {createdDate}
        </p>
      </div>

      {sections.length === 0 ? (
        <div
          style={{
            padding: "var(--space-6)",
            textAlign: "center",
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--fg-muted)",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            No materials computed for this estimate.
          </p>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)" }}>
            Materials are auto-calculated when scope measurements are entered during estimate creation.
          </p>
        </div>
      ) : (
        <>
          {sections.map((section) => (
            <div key={section.section} style={{ marginBottom: "var(--space-5)" }}>
              {/* Section header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--space-1) 0",
                  borderBottom: "2px solid var(--border)",
                  marginBottom: "var(--space-2)",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "var(--text-base)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {section.section}
                </h2>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-muted)" }}>
                  {formatDollars(section.section_total_cents)}
                </span>
              </div>

              {/* Items */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-1) 0", fontWeight: 600 }}>Item</th>
                    <th style={{ textAlign: "right", padding: "var(--space-1) var(--space-2)", fontWeight: 600, width: 100 }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "var(--space-1) 0", fontWeight: 600, width: 80 }}>Unit</th>
                    <th style={{ textAlign: "right", padding: "var(--space-1) 0", fontWeight: 600, width: 80 }}>Est. Cost</th>
                    <th style={{ textAlign: "center", padding: "var(--space-1) 0", width: 48 }} className="no-print">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr
                      key={item.material.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <td style={{ padding: "var(--space-2) 0" }}>
                        <span style={{ fontWeight: item.material.is_optional ? 400 : 500 }}>
                          {item.material.material_name}
                        </span>
                        {item.material.is_optional && (
                          <span style={{ marginLeft: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic" }}>
                            optional
                          </span>
                        )}
                        {item.material.description && (
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 1 }}>
                            {item.material.description}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", padding: "var(--space-2) var(--space-2)" }}>
                        {item.quantity}
                      </td>
                      <td style={{ textAlign: "right", padding: "var(--space-2) 0", color: "var(--fg-muted)" }}>
                        {item.material.unit}
                      </td>
                      <td style={{ textAlign: "right", padding: "var(--space-2) 0", fontWeight: 500 }}>
                        {formatDollars(item.total_cost_cents)}
                      </td>
                      <td style={{ textAlign: "center", padding: "var(--space-2) 0" }} className="no-print">
                        <input type="checkbox" style={{ width: 16, height: 16 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Total */}
          <div
            style={{
              marginTop: "var(--space-4)",
              paddingTop: "var(--space-3)",
              borderTop: "2px solid var(--fg)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div>
              <span style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>Materials Total</span>
              <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                + 15% handling fee billed to client
              </span>
            </div>
            <span style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>
              {formatDollars(materialTotalCents)}
            </span>
          </div>

          <p
            style={{
              marginTop: "var(--space-4)",
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
              lineHeight: 1.5,
            }}
          >
            Quantities include standard waste factor. Prices are estimates based on current pricing — actual costs may vary.
            A 15% materials handling fee is added to the client invoice.
          </p>
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>
    </div>
  );
}
