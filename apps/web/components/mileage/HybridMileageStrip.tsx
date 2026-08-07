import {
  hybridVerifyLabel,
  milesSourceLabel,
  type HybridMileageDaySummary,
} from "@ai-fsm/domain";

/**
 * Dual-path mileage card: odometer PRIMARY + GPS corroboration (TASK-091).
 */
export function HybridMileageStrip({
  mileage,
  title = "Hybrid mileage",
  exportHref,
}: {
  mileage: HybridMileageDaySummary;
  title?: string;
  /** Optional link to CSV export for this day. */
  exportHref?: string | null;
}) {
  const hasSession = !!mileage.vehicleSessionId;
  const method =
    milesSourceLabel(mileage.primarySource) ??
    (mileage.primaryMiles != null ? "Odometer" : null);
  const verify = hybridVerifyLabel(mileage.reason, mileage.deltaPercent);

  return (
    <section
      data-testid="hybrid-mileage-strip"
      style={{
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 8,
        padding: "var(--space-4, 1rem)",
        marginBottom: "var(--space-4, 1rem)",
        background: "var(--surface, #fff)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "0.75rem",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>{title}</h2>
        {exportHref ? (
          <a href={exportHref} style={{ fontSize: "0.85rem" }}>
            Export CSV
          </a>
        ) : null}
      </div>

      {!hasSession ? (
        <p style={{ margin: 0, color: "var(--fg-muted, #6b7280)", fontSize: "0.9rem" }}>
          No vehicle odometer session for this day. GPS may still show drives below.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem", fontSize: "0.9rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--fg-muted, #6b7280)" }}>Vehicle</span>
            <strong>{mileage.vehicleName ?? "Vehicle"}</strong>
          </div>
          {(mileage.startOdometer != null || mileage.endOdometer != null) && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--fg-muted, #6b7280)" }}>Odometer</span>
              <span>
                {mileage.startOdometer != null
                  ? Number(mileage.startOdometer).toLocaleString()
                  : "—"}
                {" → "}
                {mileage.endOdometer != null
                  ? Number(mileage.endOdometer).toLocaleString()
                  : "—"}
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--fg-muted, #6b7280)" }}>
              Primary miles
              <span
                style={{
                  marginLeft: 8,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "0.1rem 0.35rem",
                  borderRadius: 4,
                  background: "var(--color-accent-soft, #ffedd5)",
                  color: "var(--color-accent, #c2410c)",
                }}
              >
                PRIMARY
              </span>
              {method ? (
                <span style={{ marginLeft: 6, fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                  ({method})
                </span>
              ) : null}
            </span>
            <strong>
              {mileage.primaryMiles != null ? `${mileage.primaryMiles} mi` : "—"}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--fg-muted, #6b7280)" }}>GPS corroboration</span>
            <span>{mileage.gpsMiles} mi</span>
          </div>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "0.8rem",
              color: mileage.flagged
                ? "var(--color-warning, #ca8a04)"
                : "var(--fg-muted, #6b7280)",
            }}
          >
            {verify}
          </p>
        </div>
      )}

      {!hasSession && mileage.gpsMiles > 0 ? (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          GPS drives (no odometer): <strong>{mileage.gpsMiles} mi</strong>
        </p>
      ) : null}
    </section>
  );
}
