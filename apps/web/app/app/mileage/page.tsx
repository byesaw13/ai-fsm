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
  Tabs,
} from "@/components/ui";
import type { TabDef } from "@/components/ui";

export const dynamic = "force-dynamic";

interface ActivityRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  label: string | null;
  entity_title: string | null;
}

interface SessionRow {
  id: string;
  session_date: string;
  miles: string;
  start_odometer: number | null;
  end_odometer: number | null;
  notes: string | null;
  vehicle_id: string | null;
  vehicle_nickname: string | null;
  vehicle_plate: string | null;
  created_by_name: string | null;
  activities: ActivityRow[];
  [key: string]: unknown;
}

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  job:          "Job",
  visit:        "Visit",
  estimate:     "Estimate",
  supplier_run: "Supplier",
  other:        "Other",
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function recentMonths(count = 6): TabDef[] {
  const months: TabDef[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    months.push({ key, label, href: `/app/mileage?month=${key}` as Route });
  }
  return months;
}

export default async function MileagePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { month } = await searchParams;
  const activeMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();

  const [year, mon] = activeMonth.split("-");
  const monthLabel = new Date(parseInt(year), parseInt(mon) - 1, 1).toLocaleDateString(undefined, {
    year: "numeric", month: "long",
  });

  const sessions = await query<SessionRow>(
    `SELECT s.id, s.session_date::text,
            COALESCE(s.miles, s.end_odometer - s.start_odometer) AS miles,
            s.start_odometer, s.end_odometer, s.notes,
            s.vehicle_id, v.nickname AS vehicle_nickname, v.plate AS vehicle_plate,
            u.full_name AS created_by_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'id',           a.id,
                  'entity_type',  a.entity_type,
                  'entity_id',    a.entity_id,
                  'label',        a.label,
                  'entity_title', CASE
                    WHEN a.entity_type = 'job'      THEN j.title
                    WHEN a.entity_type = 'visit'    THEN vi.title
                    WHEN a.entity_type = 'estimate' THEN est.id_short
                    ELSE a.label
                  END
                ) ORDER BY a.created_at
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'::json
            ) AS activities
     FROM vehicle_sessions s
     LEFT JOIN vehicles v   ON v.id = s.vehicle_id
     LEFT JOIN users u      ON u.id = s.created_by
     LEFT JOIN vehicle_session_activities a ON a.session_id = s.id
     LEFT JOIN jobs j        ON j.id = a.entity_id AND a.entity_type = 'job'
     LEFT JOIN visits vi     ON vi.id = a.entity_id AND a.entity_type = 'visit'
     LEFT JOIN estimates est ON est.id = a.entity_id AND a.entity_type = 'estimate'
     WHERE s.account_id = $1
       AND to_char(s.session_date, 'YYYY-MM') = $2
     GROUP BY s.id, v.nickname, v.plate, u.full_name
     ORDER BY s.session_date DESC, s.created_at DESC`,
    [session.accountId, activeMonth]
  );

  const totalMiles = sessions.reduce((sum, r) => sum + parseFloat(r.miles), 0);
  const sessionCount = sessions.length;
  const avgMiles = sessionCount > 0 ? totalMiles / sessionCount : 0;

  const canManage = session.role === "owner" || session.role === "admin";

  return (
    <PageContainer>
      <PageHeader
        title="Mileage"
        subtitle={monthLabel}
        actions={
          canManage ? (
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <LinkButton href={"/app/mileage/vehicles" as Route} variant="ghost" size="sm">
                Vehicles
              </LinkButton>
              <LinkButton href={"/app/mileage/new" as Route} variant="primary" size="sm">
                + Log Session
              </LinkButton>
            </div>
          ) : undefined
        }
      />

      <Tabs tabs={recentMonths()} activeKey={activeMonth} />

      <MetricGrid
        metrics={[
          { label: "Total Miles", value: totalMiles.toFixed(1) },
          { label: "Sessions", value: String(sessionCount) },
          { label: "Avg per Session", value: avgMiles > 0 ? avgMiles.toFixed(1) : "—" },
        ]}
      />

      {sessions.length === 0 ? (
        <EmptyState
          title={`No sessions logged for ${monthLabel}`}
          description={canManage ? "Use the button above to log a vehicle session." : "No mileage recorded this month."}
          data-testid="mileage-empty"
        />
      ) : (
        <Card>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Date</th>
                <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Vehicle</th>
                <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Activities</th>
                <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Odometer</th>
                <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Miles</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {new Date(s.session_date + "T00:00:00").toLocaleDateString(undefined, {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", verticalAlign: "top" }}>
                    {s.vehicle_nickname ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.vehicle_nickname}</div>
                        {s.vehicle_plate && (
                          <div style={{ fontFamily: "monospace", fontSize: "var(--text-xs)", color: "var(--fg-muted)", letterSpacing: 1 }}>{s.vehicle_plate}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--fg-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", verticalAlign: "top" }}>
                    {s.activities.length === 0 ? (
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                        {s.notes ?? "—"}
                      </span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                        {s.activities.map((a) => {
                          const entityHref = a.entity_type === "job" && a.entity_id
                            ? `/app/jobs/${a.entity_id}`
                            : a.entity_type === "visit" && a.entity_id
                            ? `/app/visits/${a.entity_id}`
                            : a.entity_type === "estimate" && a.entity_id
                            ? `/app/estimates/${a.entity_id}`
                            : null;
                          const chip = (
                            <span style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: 99,
                              fontSize: "var(--text-xs)",
                              fontWeight: 500,
                              background: "var(--surface-raised)",
                              border: "1px solid var(--border)",
                              color: "var(--fg)",
                              whiteSpace: "nowrap",
                            }}>
                              <span style={{ color: "var(--fg-muted)" }}>{ENTITY_TYPE_LABELS[a.entity_type] ?? a.entity_type}:</span>{" "}
                              {a.entity_title ?? a.label ?? "—"}
                            </span>
                          );
                          return entityHref ? (
                            <Link key={a.id} href={entityHref as Route} style={{ textDecoration: "none" }}>{chip}</Link>
                          ) : (
                            <span key={a.id}>{chip}</span>
                          );
                        })}
                      </div>
                    )}
                    {s.notes && s.activities.length > 0 && (
                      <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>{s.notes}</div>
                    )}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "monospace", fontSize: "var(--text-xs)", color: "var(--fg-muted)", whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {s.start_odometer != null && s.end_odometer != null
                      ? `${s.start_odometer.toLocaleString()} → ${s.end_odometer.toLocaleString()}`
                      : "—"}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 700, verticalAlign: "top" }}>
                    {parseFloat(s.miles).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: "var(--space-2) var(--space-3)" }}>Total</td>
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{totalMiles.toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}
