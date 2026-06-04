import Link from "next/link";
import type { Route } from "next";
import { formatPropertyCents, formatPropertyDate } from "./property-history-helpers";

export type ServiceHistoryRow = {
  job_id: string;
  job_title: string;
  job_status: string;
  last_visit_id: string | null;
  last_visit_date: string | null;
  tech_notes_preview: string | null;
  invoice_id: string | null;
  invoice_total: number | null;
  paid_cents: number | null;
  invoice_status: string | null;
};

export function PropertyServiceHistory({ rows }: { rows: ServiceHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", padding: "var(--space-3) 0" }}>
        No completed work recorded at this property yet.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const fullyPaid = row.paid_cents != null && row.invoice_total != null && row.paid_cents >= row.invoice_total;

        return (
          <div
            key={row.job_id}
            style={{
              paddingBottom: isLast ? 0 : "var(--space-4)",
              marginBottom: isLast ? 0 : "var(--space-4)",
              borderBottom: isLast ? "none" : "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)", flexWrap: "wrap" }}>
              <Link
                href={`/app/jobs/${row.job_id}` as Route}
                style={{ fontSize: "var(--text-sm)", fontWeight: 600, textDecoration: "none", color: "var(--fg-primary)" }}
              >
                {row.job_title}
              </Link>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  color: "#16a34a",
                  background: "#dcfce7",
                  padding: "1px 7px",
                  borderRadius: 99,
                }}
              >
                {row.job_status}
              </span>
            </div>

            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {row.last_visit_date && (
                <span>
                  Completed {formatPropertyDate(row.last_visit_date)}
                  {row.last_visit_id && (
                    <>
                      {" · "}
                      <Link
                        href={`/app/visits/${row.last_visit_id}` as Route}
                        style={{ color: "inherit", textDecoration: "underline" }}
                      >
                        View visit
                      </Link>
                    </>
                  )}
                </span>
              )}
              {row.invoice_total != null && (
                <span>
                  {formatPropertyCents(row.invoice_total)}
                  {fullyPaid && (
                    <span style={{ color: "#16a34a" }}> · Paid</span>
                  )}
                  {row.invoice_id && (
                    <>
                      {" · "}
                      <Link
                        href={`/app/invoices/${row.invoice_id}` as Route}
                        style={{ color: "inherit", textDecoration: "underline" }}
                      >
                        Invoice
                      </Link>
                    </>
                  )}
                </span>
              )}
            </div>

            {row.tech_notes_preview && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "var(--space-1)", fontStyle: "italic" }}>
                {row.tech_notes_preview.length > 160
                  ? `${row.tech_notes_preview.slice(0, 157)}…`
                  : row.tech_notes_preview}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
