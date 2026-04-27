import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  Card,
  EmptyState,
  LinkButton,
  MetricGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";

export const dynamic = "force-dynamic";

interface MileageRow {
  id: string;
  trip_date: string;
  miles: string;
  purpose: string;
  notes: string | null;
  job_id: string | null;
  job_title: string | null;
  created_by_name: string | null;
  [key: string]: unknown;
}

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default async function MileagePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { month } = await searchParams;
  const activeMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();

  const [year, mon] = activeMonth.split("-");
  const monthLabel = new Date(parseInt(year), parseInt(mon) - 1, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  const logs = await query<MileageRow>(
    `SELECT m.id, m.trip_date::text, m.miles::text, m.purpose, m.notes,
            m.job_id, j.title AS job_title, u.full_name AS created_by_name
     FROM mileage_logs m
     LEFT JOIN jobs j ON j.id = m.job_id
     LEFT JOIN users u ON u.id = m.created_by
     WHERE m.account_id = $1
       AND to_char(m.trip_date, 'YYYY-MM') = $2
     ORDER BY m.trip_date DESC, m.created_at DESC`,
    [session.accountId, activeMonth]
  );

  const totalMiles = logs.reduce((sum, r) => sum + parseFloat(r.miles), 0);
  const tripCount = logs.length;
  const avgMiles = tripCount > 0 ? totalMiles / tripCount : 0;

  // Build prev/next month links
  const d = new Date(parseInt(year), parseInt(mon) - 1, 1);
  const prevDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const nextDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = activeMonth === currentMonth();

  const canManage = session.role === "owner" || session.role === "admin";

  return (
    <PageContainer>
      <PageHeader
        title="Mileage"
        subtitle={monthLabel}
        actions={
          canManage ? (
            <LinkButton href={"/app/mileage/new" as Route} variant="primary" size="sm">
              + Log Trip
            </LinkButton>
          ) : undefined
        }
      />

      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
        <Link href={`/app/mileage?month=${prevMonth}` as Route} style={{ color: "var(--accent)" }}>← Prev</Link>
        <span style={{ color: "var(--fg-muted)" }}>{monthLabel}</span>
        {!isCurrentMonth && (
          <Link href={`/app/mileage?month=${nextMonth}` as Route} style={{ color: "var(--accent)" }}>Next →</Link>
        )}
      </div>

      {/* Metrics */}
      <MetricGrid
        metrics={[
          { label: "Total Miles", value: totalMiles.toFixed(1), variant: totalMiles > 0 ? "default" : "default" },
          { label: "Trips", value: String(tripCount) },
          { label: "Avg per Trip", value: avgMiles > 0 ? avgMiles.toFixed(1) : "—" },
        ]}
      />

      {logs.length === 0 ? (
        <div style={{ marginTop: "var(--space-6)" }}>
          <EmptyState
            title={`No trips logged for ${monthLabel}`}
            description={canManage ? "Use the button above to log a trip." : "No mileage recorded this month."}
            action={
              canManage ? (
                <Link href={"/app/mileage/new" as Route} style={{ color: "var(--accent)" }}>
                  Log your first trip
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Card style={{ marginTop: "var(--space-6)" }}>
          <SectionHeader title="Trip Log" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Date</th>
                <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Purpose</th>
                <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Job</th>
                <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Miles</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap" }}>
                    {new Date(log.trip_date + "T00:00:00").toLocaleDateString(undefined, {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    <div>{log.purpose}</div>
                    {log.notes && <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{log.notes}</div>}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    {log.job_id ? (
                      <Link href={`/app/jobs/${log.job_id}` as Route} style={{ color: "var(--accent)", textDecoration: "none" }}>
                        {log.job_title ?? log.job_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--fg-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 600 }}>
                    {parseFloat(log.miles).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: "var(--space-2) var(--space-3)" }}>Total</td>
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{totalMiles.toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}
