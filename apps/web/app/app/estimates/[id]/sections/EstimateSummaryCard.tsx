import { PREP_LEVEL_MULTIPLIERS, computeRoomMeasurements } from "@ai-fsm/domain";
import type { RoomSpec, Role } from "@ai-fsm/domain";
import { formatDollars } from "../format";
import type { EstimateRow } from "../detail-data";

interface Props {
  estimate: EstimateRow;
  role: Role;
  documentFilename: string;
}

/**
 * The estimate "Summary" card: totals, dates, scope assumptions, painting
 * scope, room-by-room breakdown, internal margin, internal notes, materials
 * plan, and pricing guardrails. Owner/admin-only blocks are gated by role.
 */
export function EstimateSummaryCard({ estimate, role, documentFilename }: Props) {
  const isOwnerAdmin = role === "owner" || role === "admin";

  return (
    <div className="card detail-card">
      <h2>Summary</h2>

      {/* Money anchor: the total leads, deposit/balance read as chips beside it */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap", margin: "var(--space-2) 0 var(--space-1)" }}>
        <span data-testid="estimate-total" style={{ fontSize: "var(--text-3xl, 1.875rem)", fontWeight: 800, letterSpacing: "-0.02em" }}>
          {formatDollars(estimate.total_cents)}
        </span>
        {estimate.deposit_cents > 0 && (
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)", whiteSpace: "nowrap" }}>
            Deposit {formatDollars(estimate.deposit_cents)}
          </span>
        )}
        {estimate.balance_cents > 0 && (
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg-secondary)", whiteSpace: "nowrap" }}>
            Balance {formatDollars(estimate.balance_cents)}
          </span>
        )}
      </div>
      {(estimate.sent_at || estimate.expires_at) && (
        <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          {estimate.sent_at && <>Sent {new Date(estimate.sent_at).toLocaleDateString()}</>}
          {estimate.sent_at && estimate.expires_at && " · "}
          {estimate.expires_at && <>Expires {new Date(estimate.expires_at).toLocaleDateString()}</>}
        </p>
      )}
      {estimate.notes && (
        <p><strong>Notes:</strong> {estimate.notes}</p>
      )}

      {estimate.scope_assumptions && (
        <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontWeight: 600, marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>Service Conditions</p>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", whiteSpace: "pre-wrap", margin: 0 }}>
            {estimate.scope_assumptions}
          </p>
        </div>
      )}

      {/* Painting scope details */}
      {estimate.sq_ft !== null && (
        <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontWeight: 600, marginBottom: "var(--space-1)" }}>Painting Scope</p>
          <p><strong>Square footage:</strong> {Number(estimate.sq_ft).toLocaleString()} sq ft</p>
          {estimate.prep_level !== null && (
            <p><strong>Prep level:</strong> {estimate.prep_level} ({PREP_LEVEL_MULTIPLIERS[estimate.prep_level]?.toFixed(2)}x multiplier)</p>
          )}
          <p><strong>Trim:</strong> {estimate.includes_trim ? "Included" : "Not included"}</p>
          <p><strong>Ceiling:</strong> {estimate.includes_ceiling ? "Included (+30% surface)" : "Not included"}</p>
        </div>
      )}

      {/* Room-by-room breakdown (owner/admin only) */}
      {isOwnerAdmin && Array.isArray(estimate.room_specs) && (estimate.room_specs as RoomSpec[]).length > 0 && (() => {
        const rooms = estimate.room_specs as RoomSpec[];
        return (
          <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)", color: "var(--fg-muted)" }}>Room Breakdown</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Room", "Dimensions", "Wall sqft", "Ceiling", "Trim LF", "Paint", "Grade", "Prep"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "2px 8px 4px 0", color: "var(--fg-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room, i) => {
                    const m = computeRoomMeasurements(room);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "3px 8px 3px 0", fontWeight: 500 }}>{room.name || `Room ${i + 1}`}</td>
                        <td style={{ padding: "3px 8px 3px 0", color: "var(--fg-muted)" }}>{room.length_ft}×{room.width_ft}×{room.ceiling_height_ft}ft</td>
                        <td style={{ padding: "3px 8px 3px 0" }}>{m.wall_sqft.toFixed(0)}</td>
                        <td style={{ padding: "3px 8px 3px 0" }}>{room.include_ceiling ? `${m.ceiling_sqft.toFixed(0)} sqft` : "—"}</td>
                        <td style={{ padding: "3px 8px 3px 0" }}>{room.include_trim ? `${m.trim_lf.toFixed(0)} LF` : "—"}</td>
                        <td style={{ padding: "3px 8px 3px 0" }}>{room.paint_supplied_by === "customer" ? "Client" : "Dovetails"}</td>
                        <td style={{ padding: "3px 8px 3px 0", textTransform: "capitalize" }}>{room.paint_supplied_by === "customer" ? "—" : room.paint_grade}</td>
                        <td style={{ padding: "3px 8px 3px 0", textTransform: "capitalize" }}>{room.prep_level}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Internal margin — owner/admin only */}
      {isOwnerAdmin && estimate.internal_labor_cost_cents !== null && estimate.internal_labor_cost_cents > 0 && (
        <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
          <p style={{ fontWeight: 600, marginBottom: "var(--space-1)", color: "var(--fg-muted)" }}>Internal Margin</p>
          {(() => {
            const laborRevenue = estimate.subtotal_cents - (estimate.internal_material_cost_cents ?? 0) - Math.round((estimate.internal_material_cost_cents ?? 0) * 0.15);
            const internalCost = estimate.internal_labor_cost_cents!;
            const marginCents = laborRevenue - internalCost;
            const marginPct = laborRevenue > 0 ? Math.round((marginCents / laborRevenue) * 100 * 10) / 10 : 0;
            const marginColor = marginPct >= 30 ? "var(--color-success)" : marginPct >= 15 ? "var(--color-warning)" : "var(--color-danger)";
            return (
              <>
                <p><strong>Internal labor cost:</strong> {formatDollars(estimate.internal_labor_cost_cents!)}</p>
                <p><strong>Labor revenue:</strong> {formatDollars(laborRevenue)}</p>
                <p>
                  <strong>Gross margin:</strong>{" "}
                  <span style={{ color: marginColor, fontWeight: 700 }}>
                    {marginPct}% ({formatDollars(marginCents)})
                  </span>
                </p>
              </>
            );
          })()}
        </div>
      )}

      {estimate.internal_notes && role !== "tech" && (
        <p><strong>Internal Notes:</strong> {estimate.internal_notes}</p>
      )}

      {/* Shopping list — owner/admin only */}
      {isOwnerAdmin && (() => {
        const shoppingList = estimate.shopping_list_json as {
          sections?: Array<{
            section: string;
            computed_items: Array<{ material: { material_name: string; unit: string; id: string }; quantity: number; total_cost_cents: number }>;
            specified_items: Array<{ name: string; units_to_order: number; unit_label: string; unit_cost_cents: number | null; notes: string | null }>;
            section_total_cents: number;
          }>;
          total_catalog_cost_cents?: number;
          total_specified_cost_cents?: number;
        } | null | undefined;
        if (!shoppingList?.sections?.length) {
          // Fallback for old estimates created before Block 3 — link to the recomputed view
          return (
            <div id="materials-plan" style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
              <a href={`/app/estimates/${estimate.id}/shopping-list`} style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>
                Open Materials Plan →
              </a>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: 8 }}>
                (computed from scope snapshots)
              </span>
            </div>
          );
        }
        const grandTotal = (shoppingList.total_catalog_cost_cents ?? 0) + (shoppingList.total_specified_cost_cents ?? 0);
        return (
          <div id="materials-plan" style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px dashed var(--border)" }}>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)", color: "var(--fg-muted)" }}>
              Materials Plan
              {grandTotal > 0 && (
                <span style={{ fontWeight: 400, marginLeft: 8, fontSize: "var(--text-sm)" }}>
                  est. {formatDollars(grandTotal)}
                </span>
              )}
            </p>
            {shoppingList.sections.map((sec) => (
              <div key={sec.section} style={{ marginBottom: "var(--space-2)" }}>
                <p style={{ fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-muted)", margin: "0 0 4px" }}>
                  {sec.section}
                </p>
                {sec.computed_items.map((m) => (
                  <div key={m.material.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "2px 0" }}>
                    <span>{m.material.material_name}</span>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {m.quantity} {m.material.unit} — {formatDollars(m.total_cost_cents)}
                    </span>
                  </div>
                ))}
                {sec.specified_items.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "2px 0", fontStyle: "italic" }}>
                    <span>{m.name} <span style={{ color: "#0284c7", fontSize: "var(--text-xs)" }}>(specified)</span></span>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {m.units_to_order} {m.unit_label}
                      {m.unit_cost_cents ? ` — ${formatDollars(m.units_to_order * m.unit_cost_cents)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Internal details — collapsed by default so client-facing info leads */}
      {isOwnerAdmin && (
        <details style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Internal details — pricing guardrails &amp; document
          </summary>
          <div style={{ marginTop: "var(--space-2)" }}>
            <p><strong>Review:</strong> {estimate.pricing_review_status.replace(/_/g, " ")}</p>
            <p><strong>Trips:</strong> {estimate.trip_count === "multi_trip" ? "Multi-trip" : "One trip"}</p>
            <p><strong>Finish:</strong> {estimate.finish_expectation}</p>
            {(estimate.travel_surcharge_cents > 0 || estimate.risk_adjustment_cents > 0) && (
              <p>
                <strong>Adjustments:</strong>{" "}
                {formatDollars(estimate.travel_surcharge_cents + estimate.risk_adjustment_cents)}
              </p>
            )}
            {estimate.minimum_service_override_reason && (
              <p><strong>Minimum override:</strong> {estimate.minimum_service_override_reason.replace(/_/g, " ")}</p>
            )}
            <p style={{ overflowWrap: "anywhere" }}><strong>Document filename:</strong> <code style={{ fontSize: "var(--text-xs)" }}>{documentFilename}</code></p>
          </div>
        </details>
      )}
    </div>
  );
}
