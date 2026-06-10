import { formatDollars } from "../format";
import type { EstimateRow, LineItemRow, OptionWithItems } from "../detail-data";

/** Postgres numerics arrive as "1.00" — render whole quantities without decimals. */
function fmtQty(q: number | string): string {
  return Number(q).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

interface Props {
  estimate: EstimateRow;
  lineItems: LineItemRow[];
  options: OptionWithItems[];
}

/**
 * Renders the estimate's pricing breakdown: multi-option comparison, or —
 * for standard estimates — a phone card list and a desktop table, both
 * emitted and toggled by viewport (p7-only-* utilities). Canonical
 * data-testids live on the desktop variant only, so e2e selectors stay
 * unique.
 */
export function EstimateLineItems({ estimate, lineItems, options }: Props) {
  if (estimate.presentation_mode === "multi_option" && options.length > 0) {
    return (
      <div>
        <div className="card">
          <h2>Options</h2>
          <p className="muted">Compare options and choose the one that best fits your needs.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: "var(--space-4)" }}>
          {options.map((option) => (
            <div
              key={option.id}
              className="card"
              style={{
                border: option.is_recommended ? "2px solid var(--accent)" : "1px solid var(--border)",
                position: "relative", display: "flex", flexDirection: "column",
              }}
            >
              {option.is_recommended && (
                <div style={{
                  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                  background: "var(--accent)", color: "#fff", padding: "2px 12px", borderRadius: 99,
                  fontSize: "var(--text-xs)", fontWeight: 600, whiteSpace: "nowrap", zIndex: 1,
                }}>
                  Recommended
                </div>
              )}
              <div style={{ marginBottom: "var(--space-3)" }}>
                <h2 style={{ margin: "0 0 var(--space-1)" }}>{option.label}</h2>
                {option.description && (
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>{option.description}</p>
                )}
              </div>

              <table className="line-items-table" style={{ flex: 1 }}>
                <tbody>
                  {option.line_items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td>{fmtQty(item.quantity)}</td>
                      <td>{formatDollars(item.unit_price_cents)}</td>
                      <td>{formatDollars(item.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)", marginTop: "var(--space-3)" }}>
                {option.tax_cents > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    <span>Tax</span>
                    <span>{formatDollars(option.tax_cents)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
                  <strong>Total</strong>
                  <strong>{formatDollars(option.total_cents)}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ---- Phone: card list ---- */}
      <div className="p7-only-mobile">
        <div className="card">
          <h2>Line Items</h2>
          {lineItems.length === 0 && estimate.subtotal_cents === 0 ? (
            <p className="muted">No line items.</p>
          ) : lineItems.length === 0 ? (
            <div style={{ padding: "var(--space-3)", borderRadius: "var(--radius)", background: "var(--bg)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600 }}>Flat rate</span>
              <span style={{ fontWeight: 700 }}>{formatDollars(estimate.subtotal_cents)}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {lineItems.map((item) => (
                <div key={item.id} style={{ padding: "var(--space-3)", borderRadius: "var(--radius)", background: "var(--bg)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
                    <span style={{ fontWeight: 500, fontSize: "var(--text-sm)", flex: 1 }}>{item.description}</span>
                    <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}>{formatDollars(item.total_cents)}</span>
                  </div>
                  {Number(item.quantity) !== 1 && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                      {fmtQty(item.quantity)} × {formatDollars(item.unit_price_cents)}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ padding: "var(--space-3)", borderRadius: "var(--radius)", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
                {estimate.tax_cents > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    <span>Tax</span><span>{formatDollars(estimate.tax_cents)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "var(--text-base)" }}>
                  <span>Total</span><span>{formatDollars(estimate.total_cents)}</span>
                </div>
                {estimate.deposit_cents > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    <span>Deposit</span><span>{formatDollars(estimate.deposit_cents)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Desktop: table ---- */}
      <div className="p7-only-desktop">
        <div className="card">
          <h2>Line Items</h2>
          {lineItems.length === 0 && estimate.subtotal_cents === 0 ? (
            <p className="muted" data-testid="line-items-empty">No line items.</p>
          ) : lineItems.length === 0 ? (
            /* Flat-rate estimate — no breakdown rows */
            <table className="line-items-table" data-testid="line-items-table">
              <tbody>
                <tr data-testid="line-item-row">
                  <td>Flat rate</td>
                  <td colSpan={2}></td>
                  <td>{formatDollars(estimate.subtotal_cents)}</td>
                </tr>
              </tbody>
              <tfoot>
                {estimate.tax_cents > 0 && (
                  <tr>
                    <td colSpan={2}></td>
                    <td className="subtotal-label">Tax</td>
                    <td>{formatDollars(estimate.tax_cents)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2}></td>
                  <td className="subtotal-label"><strong>Total</strong></td>
                  <td><strong data-testid="estimate-total-footer">{formatDollars(estimate.total_cents)}</strong></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="line-items-table" data-testid="line-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th style={{ width: 120 }}>Unit Price</th>
                  <th style={{ width: 100 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const laborItems = lineItems.filter((li) => li.line_item_type === "labor" || !li.line_item_type);
                  const materialItems = lineItems.filter((li) => li.line_item_type === "materials");
                  const handlingItems = lineItems.filter((li) => li.line_item_type === "handling_fee");
                  const adjustmentItems = lineItems.filter((li) => li.line_item_type === "adjustment");
                  const renderRow = (item: LineItemRow, muted = false) => (
                    <tr key={item.id} data-testid="line-item-row" style={muted ? { color: "var(--fg-muted)" } : undefined}>
                      <td>{item.description}</td>
                      <td>{fmtQty(item.quantity)}</td>
                      <td>{formatDollars(item.unit_price_cents)}</td>
                      <td>{formatDollars(item.total_cents)}</td>
                    </tr>
                  );
                  return (
                    <>
                      {laborItems.map((item) => renderRow(item))}
                      {adjustmentItems.map((item) => renderRow(item))}
                      {materialItems.length > 0 && (
                        <tr>
                          <td colSpan={4} style={{
                            fontSize: "var(--text-xs)", fontWeight: 600,
                            textTransform: "uppercase", letterSpacing: "0.05em",
                            color: "var(--fg-muted)", paddingTop: "var(--space-3)",
                            borderTop: "1px dashed var(--border)",
                          }}>
                            Materials
                          </td>
                        </tr>
                      )}
                      {materialItems.map((item) => renderRow(item))}
                      {handlingItems.map((item) => renderRow(item, true))}
                    </>
                  );
                })()}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}></td>
                  <td className="subtotal-label"><strong>Subtotal</strong></td>
                  <td data-testid="estimate-subtotal">{formatDollars(estimate.subtotal_cents)}</td>
                </tr>
                {estimate.tax_cents > 0 && (
                  <tr>
                    <td colSpan={2}></td>
                    <td className="subtotal-label">Tax</td>
                    <td>{formatDollars(estimate.tax_cents)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2}></td>
                  <td className="subtotal-label"><strong>Total</strong></td>
                  <td><strong data-testid="estimate-total-footer">{formatDollars(estimate.total_cents)}</strong></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
