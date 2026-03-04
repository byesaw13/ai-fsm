import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canViewReports, canCloseMonth, canReopenMonth } from "@/lib/auth/permissions";
import { withReportContext } from "@/lib/reports/db";
import { query } from "@/lib/db";
import {
  PageContainer,
  PageHeader,
  Card,
  SectionHeader,
  FilterBar,
} from "@/components/ui";
import type { FilterDef } from "@/components/ui";
import { CloseActions } from "./CloseActions";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Month-End Close page — /app/reports/close
//
// Shows a data-driven checklist for the selected month, CSV export links,
// close status, and close/reopen actions.
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

const CLOSE_FILTERS: FilterDef[] = [
  { name: "month", type: "text", label: "Month", placeholder: "2026-03" },
];

export default async function ClosePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canViewReports(session.role)) redirect("/app");

  const { month } = await searchParams;
  const targetMonth = month && isValidMonth(month) ? month : currentMonth();
  const monthStart = `${targetMonth}-01`;

  const [year, mon] = targetMonth.split("-");
  const monthLabel = new Date(parseInt(year), parseInt(mon) - 1, 1).toLocaleDateString(
    undefined,
    { year: "numeric", month: "long" }
  );

  // ---- Fetch close status ----
  const closeRow = await withReportContext(session, async (client) => {
    const r = await client.query(
      `SELECT pc.id, pc.period_month, pc.closed_by, pc.closed_at, pc.notes,
              u.full_name AS closed_by_name
       FROM period_closes pc
       LEFT JOIN users u ON u.id = pc.closed_by
       WHERE pc.account_id = $1 AND pc.period_month = $2
       LIMIT 1`,
      [session.accountId, targetMonth]
    );
    return r.rows[0] ?? null;
  });

  const isClosed = Boolean(closeRow);

  // ---- Fetch checklist data ----
  // These queries use application-level account_id filtering (server component).
  const [invoiceSummary, outstandingCount, expenseCount, paymentCount] =
    await Promise.all([
      query<{ total_count: string; total_cents: string }>(
        `SELECT COUNT(*)::int AS total_count,
                COALESCE(SUM(total_cents), 0)::bigint AS total_cents
         FROM invoices
         WHERE account_id = $1
           AND to_char(created_at, 'YYYY-MM') = $2`,
        [session.accountId, targetMonth]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM invoices
         WHERE account_id = $1
           AND to_char(created_at, 'YYYY-MM') = $2
           AND status IN ('sent', 'partial', 'overdue')`,
        [session.accountId, targetMonth]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM expenses
         WHERE account_id = $1
           AND expense_date >= $2::date
           AND expense_date < ($2::date + interval '1 month')`,
        [session.accountId, monthStart]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM payments
         WHERE account_id = $1
           AND received_at >= $2::date
           AND received_at < ($2::date + interval '1 month')`,
        [session.accountId, monthStart]
      ),
    ]);

  const invoiceTotal = Number(invoiceSummary[0]?.total_count ?? 0);
  const invoiceTotalCents = Number(invoiceSummary[0]?.total_cents ?? 0);
  const outstanding = Number(outstandingCount[0]?.count ?? 0);
  const expenses = Number(expenseCount[0]?.count ?? 0);
  const payments = Number(paymentCount[0]?.count ?? 0);

  const currentValues: Record<string, string> = {};
  if (month) currentValues.month = month;

  const exportBase = `/api/v1/reports/month-end-export?month=${encodeURIComponent(targetMonth)}`;

  function formatCents(cents: number): string {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Month-End Close"
        subtitle={monthLabel}
        actions={
          <Link
            href={"/app/reports" as Route}
            style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}
          >
            ← Profitability
          </Link>
        }
      />

      {/* Month selector */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <FilterBar
          filters={CLOSE_FILTERS}
          baseHref="/app/reports/close"
          currentValues={currentValues}
        />
      </div>

      {/* Close status banner */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          marginBottom: "var(--space-4)",
          borderRadius: "var(--radius)",
          border: `1px solid ${isClosed ? "var(--status-success)" : "var(--border)"}`,
          background: isClosed ? "var(--status-success-bg, #f0fdf4)" : "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              fontWeight: "var(--font-semibold)",
              color: isClosed ? "var(--status-success)" : "var(--fg-muted)",
            }}
          >
            {isClosed ? "✓ Period Closed" : "○ Period Open"}
          </span>
          {isClosed && closeRow && (
            <span style={{ marginLeft: "var(--space-3)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
              Closed by {closeRow.closed_by_name ?? "unknown"} on{" "}
              {new Date(closeRow.closed_at as string).toLocaleDateString()}
              {closeRow.notes ? ` — ${closeRow.notes}` : ""}
            </span>
          )}
        </div>

        <CloseActions
          month={targetMonth}
          isClosed={isClosed}
          canClose={canCloseMonth(session.role)}
          canReopen={canReopenMonth(session.role)}
        />
      </div>

      {/* Checklist */}
      <Card style={{ marginBottom: "var(--space-4)" }}>
        <SectionHeader title="Month-End Checklist" />
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: "0 var(--space-3) var(--space-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            fontSize: "var(--text-sm)",
          }}
        >
          <ChecklistItem
            label={`Invoices created: ${invoiceTotal} (${formatCents(invoiceTotalCents)} total)`}
            ok={invoiceTotal >= 0}
          />
          <ChecklistItem
            label={
              outstanding === 0
                ? "No outstanding invoices (sent / partial / overdue)"
                : `Outstanding invoices: ${outstanding} — review before closing`
            }
            ok={outstanding === 0}
            warn={outstanding > 0}
          />
          <ChecklistItem
            label={`Expenses recorded: ${expenses}`}
            ok={expenses >= 0}
          />
          <ChecklistItem
            label={`Payments received: ${payments}`}
            ok={payments >= 0}
          />
        </ul>
      </Card>

      {/* CSV Exports */}
      <Card>
        <SectionHeader title="Export Data" />
        <p
          style={{
            padding: "0 var(--space-3) var(--space-2)",
            color: "var(--fg-muted)",
            fontSize: "var(--text-sm)",
          }}
        >
          Download CSV files for {monthLabel}. Exports are available for closed periods.
        </p>
        <div
          style={{
            padding: "0 var(--space-3) var(--space-4)",
            display: "flex",
            gap: "var(--space-3)",
            flexWrap: "wrap",
          }}
        >
          <ExportLink href={`${exportBase}&type=invoices`} label="Export Invoices" />
          <ExportLink href={`${exportBase}&type=payments`} label="Export Payments" />
          <ExportLink href={`${exportBase}&type=expenses`} label="Export Expenses" />
          <ExportLink href={`${exportBase}&type=mileage`} label="Export Mileage" />
        </div>
      </Card>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (server-only, no interactivity needed)
// ---------------------------------------------------------------------------

function ChecklistItem({
  label,
  ok,
  warn = false,
}: {
  label: string;
  ok: boolean;
  warn?: boolean;
}) {
  const icon = warn ? "⚠" : ok ? "✓" : "–";
  const color = warn
    ? "var(--status-warning, #b45309)"
    : ok
      ? "var(--status-success)"
      : "var(--fg-muted)";

  return (
    <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
      <span style={{ color, fontWeight: warn ? 700 : 400, minWidth: "1.2em" }}>{icon}</span>
      <span style={{ color: warn ? "var(--fg)" : "var(--fg-muted)" }}>{label}</span>
    </li>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        color: "var(--accent)",
        fontSize: "var(--text-sm)",
        textDecoration: "none",
        fontWeight: "var(--font-medium)",
      }}
    >
      ↓ {label}
    </a>
  );
}
