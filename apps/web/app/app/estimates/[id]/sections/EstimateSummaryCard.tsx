import { PREP_LEVEL_MULTIPLIERS, computeRoomMeasurements } from "@ai-fsm/domain";
import type { RoomSpec, Role } from "@ai-fsm/domain";
import type { AiMaterialsDeltaItem as AiMaterialsDeltaEntry } from "@/lib/estimates/materials-delta";
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

  // Financial calculations
  const laborCostCents = estimate.internal_labor_cost_cents ?? 0;
  const materialCostCents = estimate.internal_material_cost_cents ?? 0;
  const materialHandlingCents = Math.round(materialCostCents * 0.15);
  const totalDirectCostCents = laborCostCents + materialCostCents;

  const totalQuoteCents = estimate.total_cents;
  const grossProfitCents = totalQuoteCents - totalDirectCostCents;
  const grossMarginPct = totalQuoteCents > 0 ? Math.round((grossProfitCents / totalQuoteCents) * 100 * 10) / 10 : 0;
  const effectiveHours = laborCostCents > 0 ? Math.round((laborCostCents / 8500) * 10) / 10 : 0;

  // T&M Comparison derived values
  const tmEstimatedLaborHrs = effectiveHours > 0 ? effectiveHours : 3.0;
  const tmLaborRevenueCents = Math.round(tmEstimatedLaborHrs * 11500);
  const tmMaterialRevenueCents = materialCostCents + materialHandlingCents;
  const tmTotalQuoteCents = tmLaborRevenueCents + tmMaterialRevenueCents;
  const tmGrossProfitCents = tmTotalQuoteCents - totalDirectCostCents;
  const tmGrossMarginPct = tmTotalQuoteCents > 0 ? Math.round((tmGrossProfitCents / tmTotalQuoteCents) * 100 * 10) / 10 : 0;

  return (
    <div className="card detail-card">
      <h2>Estimate Summary &amp; Financial Truth</h2>

      {/* Money anchor: total quote */}
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

      {/* OWNER/ADMIN FINANCIAL TRUTH CARD */}
      {isOwnerAdmin && (
        <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", borderRadius: 8, background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
            <span style={{ fontWeight: 700, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)" }}>
              📊 Financial Truth &amp; Profitability (Owner View)
            </span>
            <span style={{ fontSize: "var(--text-xs)", padding: "2px 8px", borderRadius: 12, fontWeight: 700, background: grossMarginPct >= 35 ? "color-mix(in srgb, var(--status-success) 12%, transparent)" : grossMarginPct >= 20 ? "color-mix(in srgb, var(--status-warning) 12%, transparent)" : "color-mix(in srgb, var(--status-error) 12%, transparent)", color: grossMarginPct >= 35 ? "var(--status-success)" : grossMarginPct >= 20 ? "var(--status-warning)" : "var(--status-error)" }}>
              {grossMarginPct}% Gross Margin
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-2)" }}>
            <div>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Direct Labor Cost</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-base)" }}>{formatDollars(laborCostCents)}</p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{effectiveHours} hrs @ $85/hr</span>
            </div>
            <div>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Material Cost Basis</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-base)" }}>{formatDollars(materialCostCents)}</p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>+15% handling ({formatDollars(materialHandlingCents)})</span>
            </div>
            <div>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Total Direct Job Cost</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-base)" }}>{formatDollars(totalDirectCostCents)}</p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Labor + Materials</span>
            </div>
            <div>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Gross Profit ($)</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-base)", color: grossProfitCents > 0 ? "var(--status-success)" : "var(--status-error)" }}>
                {formatDollars(grossProfitCents)}
              </p>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{grossMarginPct}% of Quote</span>
            </div>
          </div>
        </div>
      )}

      {/* SIDE-BY-SIDE PRICING MODE COMPARISON (FIXED vs T&M) */}
      {isOwnerAdmin && (
        <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", borderRadius: 8, background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <p style={{ fontWeight: 700, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-muted)", margin: "0 0 var(--space-2)" }}>
            ⚖️ Pricing Strategy Comparison: Fixed Rate vs. T&amp;M
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            {/* Fixed Rate Column */}
            <div style={{ padding: "var(--space-2)", borderRadius: 6, border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 4%, transparent)" }}>
              <span style={{ fontWeight: 700, fontSize: "var(--text-xs)", color: "var(--accent)" }}>📌 FIXED RATE (Current Quote)</span>
              <p style={{ margin: "4px 0 0", fontSize: "var(--text-lg)", fontWeight: 800 }}>{formatDollars(totalQuoteCents)}</p>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Profit: <strong>{formatDollars(grossProfitCents)}</strong> ({grossMarginPct}% margin)</p>
            </div>

            {/* T&M Column */}
            <div style={{ padding: "var(--space-2)", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <span style={{ fontWeight: 700, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>⏱️ T&amp;M ESTIMATE (Est {tmEstimatedLaborHrs} hrs)</span>
              <p style={{ margin: "4px 0 0", fontSize: "var(--text-lg)", fontWeight: 800 }}>{formatDollars(tmTotalQuoteCents)}</p>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Profit: <strong>{formatDollars(tmGrossProfitCents)}</strong> ({tmGrossMarginPct}% margin)</p>
            </div>
          </div>

          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-secondary)" }}>
            💡 <strong>Recommendation:</strong> Fixed Rate yields {formatDollars(grossProfitCents - tmGrossProfitCents)} additional margin while giving the client an exact guaranteed price.
          </p>
        </div>
      )}

      {estimate.notes && (
        <p style={{ marginTop: "var(--space-3)" }}><strong>Notes:</strong> {estimate.notes}</p>
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

      {estimate.internal_notes && role !== "tech" && (
        <p style={{ marginTop: "var(--space-2)" }}><strong>Internal Notes:</strong> {estimate.internal_notes}</p>
      )}

      {/* Internal details */}
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
