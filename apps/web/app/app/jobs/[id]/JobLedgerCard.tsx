import Link from "next/link";
import type { Route } from "next";
import type { JobLedgerSummary } from "@ai-fsm/domain";
import { formatCents } from "@/lib/money";
import { Card, SectionHeader, LinkButton } from "@/components/ui";
import { DraftCoFromVarianceButton } from "./DraftCoFromVarianceButton";
import { buildCoDraftFromLedger } from "@/lib/jobs/job-ledger-co-draft";

type Props = {
  ledger: JobLedgerSummary;
  jobId: string;
  clientId: string | null;
  estimateCount: number;
  invoiceCount: number;
  canCreateInvoice: boolean;
};

function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return formatCents(cents);
}

function varianceStyle(cents: number | null): React.CSSProperties {
  if (cents == null || cents === 0) return { color: "var(--fg-muted)" };
  if (cents > 0) return { color: "var(--warning, #b45309)", fontWeight: 600 };
  return { color: "var(--color-success, #16a34a)" };
}

export function JobLedgerCard({
  ledger,
  jobId,
  clientId,
  estimateCount,
  invoiceCount,
  canCreateInvoice,
}: Props) {
  const coDraft = buildCoDraftFromLedger(ledger);
  const modeLabel =
    ledger.pricingMode === "hourly_internal"
      ? "Time & Materials"
      : ledger.pricingMode === "flat_rate"
        ? "Fixed bid"
        : "Commercial";

  const rate =
    ledger.rows.find((r) => r.bucket === "labor")?.rateCentsPerHour ?? null;

  return (
    <Card data-testid="job-ledger" id="job-ledger" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader
        title="Job Ledger"
        action={
          <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {coDraft ? <DraftCoFromVarianceButton payload={coDraft} /> : null}
            {canCreateInvoice ? (
              <LinkButton
                href={
                  `/app/invoices/new?job_id=${jobId}${clientId ? `&client_id=${clientId}` : ""}${
                    ledger.estimateId ? `&approved_estimate_id=${ledger.estimateId}` : ""
                  }` as Route
                }
                variant="secondary"
                size="sm"
                data-testid="ledger-draft-invoice"
              >
                Draft invoice
              </LinkButton>
            ) : null}
          </span>
        }
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 16px",
          marginBottom: "var(--space-3)",
          fontSize: "var(--text-sm)",
          lineHeight: 1.45,
        }}
      >
        <div>
          {ledger.estimateId ? (
            <Link
              href={`/app/estimates/${ledger.estimateId}` as Route}
              style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}
            >
              {ledger.estimateNumber ?? "Estimate"} · {ledger.estimateStatus ?? "—"} →
            </Link>
          ) : (
            <span style={{ color: "var(--fg-muted)" }}>No commercial estimate</span>
          )}
          <span style={{ color: "var(--fg-muted)", marginLeft: 8 }}>
            {modeLabel}
            {rate != null && ledger.pricingMode === "hourly_internal"
              ? ` · $${(rate / 100).toFixed(0)}/hr`
              : ""}
          </span>
        </div>
      </div>

      <div
        data-testid="job-ledger-header"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "var(--space-2)",
          marginBottom: "var(--space-3)",
          padding: "var(--space-3)",
          borderRadius: "var(--radius)",
          background: "var(--bg-muted, #f8fafc)",
          border: "1px solid var(--border-subtle, var(--border))",
          fontSize: "var(--text-sm)",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Sold
          </div>
          <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(ledger.soldCents)}</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Actual
          </div>
          <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }} data-testid="ledger-actual">
            {money(ledger.actualCents)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Paid
          </div>
          <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(ledger.paidCents)}</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Balance
          </div>
          <div
            style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
            data-testid="ledger-balance"
          >
            {money(ledger.balanceCents)}
          </div>
        </div>
      </div>

      {ledger.rows.length > 0 ? (
        <div
          role="table"
          aria-label="Estimate versus actual"
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
            gap: "0 8px",
            fontSize: "var(--text-sm)",
            marginBottom: "var(--space-3)",
          }}
        >
          <div role="row" style={{ display: "contents", fontWeight: 700, color: "var(--fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase" }}>
            <div role="columnheader" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>Bucket</div>
            <div role="columnheader" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", textAlign: "right" }}>Estimate</div>
            <div role="columnheader" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", textAlign: "right" }}>Actual</div>
            <div role="columnheader" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", textAlign: "right" }}>Variance</div>
          </div>
          {ledger.rows.map((row) => (
            <div
              key={row.bucket}
              role="row"
              data-testid={`ledger-row-${row.bucket}`}
              style={{ display: "contents" }}
            >
              <div role="cell" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600 }}>{row.label}</div>
                {row.bucket === "labor" && (row.actualHours != null || row.estimateHours != null) ? (
                  <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>
                    {row.estimateHours != null ? `${row.estimateHours} hrs budget` : ""}
                    {row.estimateCapHours != null ? ` · cap ${row.estimateCapHours}` : ""}
                    {row.actualHours != null ? ` · ${row.actualHours} actual` : ""}
                  </div>
                ) : null}
                {row.bucket === "labor" ? (
                  <a href="#tracked-work-days" style={{ fontSize: "var(--text-xs)", color: "var(--accent)", textDecoration: "none" }}>
                    Work days →
                  </a>
                ) : null}
                {row.bucket === "materials" ? (
                  <a href="#job-materials" style={{ fontSize: "var(--text-xs)", color: "var(--accent)", textDecoration: "none" }}>
                    Receipts →
                  </a>
                ) : null}
              </div>
              <div role="cell" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {money(row.estimateCents)}
              </div>
              <div role="cell" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {money(row.actualCents)}
              </div>
              <div
                role="cell"
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  ...varianceStyle(row.varianceCents),
                }}
              >
                {row.varianceCents == null
                  ? "—"
                  : `${row.varianceCents > 0 ? "+" : ""}${money(row.varianceCents)}`}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: "0 0 var(--space-3)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          No estimate lines or actuals yet. Create an estimate or log time and materials.
        </p>
      )}

      <dl className="p7-detail-list" style={{ margin: 0 }}>
        <div className="p7-detail-row">
          <dt>Estimates</dt>
          <dd>
            {estimateCount > 0 ? (
              <Link href={`/app/estimates?job_id=${jobId}` as Route} style={{ color: "var(--accent)", textDecoration: "none" }}>
                {estimateCount} estimate{estimateCount !== 1 ? "s" : ""} →
              </Link>
            ) : (
              <span style={{ color: "var(--fg-muted)" }}>None</span>
            )}
          </dd>
        </div>
        <div className="p7-detail-row">
          <dt>Invoices</dt>
          <dd>
            {invoiceCount > 0 ? (
              <Link href={`/app/invoices?job_id=${jobId}` as Route} style={{ color: "var(--accent)", textDecoration: "none" }}>
                {invoiceCount} invoice{invoiceCount !== 1 ? "s" : ""} →
              </Link>
            ) : (
              <span style={{ color: "var(--fg-muted)" }}>None</span>
            )}
          </dd>
        </div>
        <div className="p7-detail-row">
          <dt>Change orders</dt>
          <dd>
            {ledger.changeOrders.length > 0 && ledger.estimateId ? (
              <Link
                href={`/app/estimates/${ledger.estimateId}#change-orders` as Route}
                style={{ color: "var(--accent)", textDecoration: "none" }}
              >
                {ledger.changeOrders.length} CO
                {ledger.changeOrders.length !== 1 ? "s" : ""}
                {ledger.changeOrders.some((c) => c.status === "draft") ? " · has draft" : ""} →
              </Link>
            ) : ledger.estimateId ? (
              <span style={{ color: "var(--fg-muted)" }}>None yet</span>
            ) : (
              <span style={{ color: "var(--fg-muted)" }}>—</span>
            )}
          </dd>
        </div>
        <div className="p7-detail-row">
          <dt>Materials buy list</dt>
          <dd>
            <Link
              href={`/app/jobs/${jobId}/materials?tab=buy` as Route}
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Open buy list →
            </Link>
          </dd>
        </div>
      </dl>

      <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)", lineHeight: 1.45 }}>
        Customer bill rates and allowances. Internal cost margin is under Internal P&amp;L below.
        {ledger.suggestedCoCents > 0 && !ledger.canDraftCo
          ? " Variance detected — approve the estimate to draft a change order."
          : ""}
      </p>
    </Card>
  );
}
