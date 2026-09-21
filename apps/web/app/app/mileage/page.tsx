import { Fragment } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  Card,
  EmptyState,
  HubSubnav,
  LinkButton,
  MetricGrid,
  PageContainer,
  PageHeader,
  Tabs,
} from "@/components/ui";
import type { TabDef } from "@/components/ui";
import { MONEY_HUB_LINKS } from "@/lib/navigation/hubs";
import { groupMileageMonth, milesSourceLabel, type MilesSource } from "@ai-fsm/domain";
import { TagClaimControl } from "@/components/mileage/TagClaimControl";

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
  miles_source: MilesSource | null;
  status: string | null;
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

  const { month: monthParam } = await searchParams;
  const activeMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth();

  const [year, mon] = activeMonth.split("-");
  const monthLabel = new Date(parseInt(year), parseInt(mon) - 1, 1).toLocaleDateString(undefined, {
    year: "numeric", month: "long",
  });

  const sessions = await query<SessionRow>(
    `SELECT s.id, s.session_date::text,
            COALESCE(s.miles, s.end_odometer - s.start_odometer) AS miles,
            s.start_odometer, s.end_odometer, s.notes, s.miles_source, s.status,
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
                    WHEN a.entity_type = 'visit'    THEN COALESCE(a.label, vj.title)
                    WHEN a.entity_type = 'estimate' THEN COALESCE(a.label, ej.title)
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
     LEFT JOIN jobs j        ON j.id = a.entity_id   AND a.entity_type = 'job'
     LEFT JOIN visits vi     ON vi.id = a.entity_id  AND a.entity_type = 'visit'
     LEFT JOIN jobs vj       ON vj.id = vi.job_id
     LEFT JOIN estimates est ON est.id = a.entity_id AND a.entity_type = 'estimate'
     LEFT JOIN jobs ej       ON ej.id = est.job_id
     WHERE s.account_id = $1
       AND to_char(s.session_date, 'YYYY-MM') = $2
     GROUP BY s.id, v.nickname, v.plate, u.full_name
     ORDER BY s.session_date DESC, s.created_at DESC`,
    [session.accountId, activeMonth]
  );

  const monthSummary = groupMileageMonth(
    sessions.map((r) => {
      const acts = Array.isArray(r.activities)
        ? r.activities
        : typeof r.activities === "string"
          ? (JSON.parse(r.activities) as ActivityRow[])
          : [];
      r.activities = acts;
      return {
        id: r.id,
        session_date: r.session_date,
        miles: parseFloat(r.miles) || 0,
        miles_source: r.miles_source,
        status: r.status,
        start_odometer: r.start_odometer,
        end_odometer: r.end_odometer,
        notes: r.notes,
        tagged: acts.length > 0,
      };
    }),
  );
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const avgMiles = monthSummary.claimDays > 0 ? monthSummary.claimMiles / monthSummary.claimDays : 0;

  const canManage = session.role === "owner" || session.role === "admin";

  return (
    <PageContainer>
      <PageHeader
        title="Mileage"
        subtitle={monthLabel}
        actions={
          canManage ? (
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <LinkButton href={"/app/timeline" as Route} variant="ghost" size="sm">
                Vehicle tracking
              </LinkButton>
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

      <HubSubnav hub="Money" links={MONEY_HUB_LINKS} pathname="/app/mileage" />

      <Tabs tabs={recentMonths()} activeKey={activeMonth} />

      <MetricGrid
        metrics={[
          { label: "Claim miles", value: monthSummary.claimMiles.toFixed(1) },
          { label: "GPS check", value: monthSummary.gpsMiles.toFixed(1) },
          { label: "Odometer days", value: String(monthSummary.claimDays) },
          { label: "Avg per day", value: avgMiles > 0 ? avgMiles.toFixed(1) : "—" },
        ]}
      />
      {monthSummary.hiddenVoided + monthSummary.hiddenNoiseHops > 0 ? (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 0 }}>
          Hidden: {monthSummary.hiddenVoided} voided
          {monthSummary.hiddenNoiseHops > 0 ? `, ${monthSummary.hiddenNoiseHops} GPS hops under 1 mile` : ""}.
          Claim miles are odometer (or typed). GPS hops are a check, not extra driving.
        </p>
      ) : (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 0 }}>
          Claim miles are odometer (or typed). GPS hops are a check, not extra driving.
        </p>
      )}

      {monthSummary.days.length === 0 ? (
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
              {monthSummary.days.map((day) => {
                const claimRows = day.claimSessions.map((cs) => sessionById.get(cs.id)).filter(Boolean) as SessionRow[];
                const hopRows = day.gpsHops.map((h) => sessionById.get(h.id)).filter(Boolean) as SessionRow[];
                return (
                  <Fragment key={day.date}>
                    {claimRows.map((s, i) => (
                      <tr key={s.id} style={{ borderBottom: hopRows.length && i === claimRows.length - 1 ? undefined : "1px solid var(--border)" }}>
                        <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          {i === 0
                            ? new Date(s.session_date + "T00:00:00").toLocaleDateString(undefined, {
                                weekday: "short", month: "short", day: "numeric",
                              })
                            : null}
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", verticalAlign: "top" }}>
                          {s.vehicle_nickname ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{s.vehicle_nickname}</div>
                              {s.vehicle_plate && (
                                <div style={{ fontFamily: "monospace", fontSize: "var(--text-xs)", color: "var(--fg-muted)", letterSpacing: 1 }}>{s.vehicle_plate}</div>
                              )}
                              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                                {milesSourceLabel(s.miles_source) ?? "Odometer"}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: "var(--fg-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", verticalAlign: "top" }}>
                          {s.activities.length === 0 ? (
                            <>
                              <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                                {s.notes ?? "Not tagged"}
                              </span>
                              {canManage ? <TagClaimControl sessionId={s.id} date={s.session_date} /> : null}
                            </>
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
                    {claimRows.length === 0 ? (
                      <tr key={`${day.date}-empty`}>
                        <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap" }}>
                          {new Date(day.date + "T00:00:00").toLocaleDateString(undefined, {
                            weekday: "short", month: "short", day: "numeric",
                          })}
                        </td>
                        <td colSpan={3} style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                          GPS hops only — no odometer claim this day
                        </td>
                        <td />
                      </tr>
                    ) : null}
                    {hopRows.map((s) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--border)", color: "var(--fg-muted)" }}>
                        <td />
                        <td style={{ padding: "var(--space-1) var(--space-3)", fontSize: "var(--text-xs)" }}>
                          GPS hop
                        </td>
                        <td style={{ padding: "var(--space-1) var(--space-3)", fontSize: "var(--text-xs)" }}>
                          {s.notes ?? "Auto-captured drive"}
                        </td>
                        <td />
                        <td style={{ padding: "var(--space-1) var(--space-3)", textAlign: "right", fontSize: "var(--text-xs)" }}>
                          {parseFloat(s.miles).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                    {day.hiddenNoiseHops > 0 ? (
                      <tr key={`${day.date}-noise`} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td />
                        <td colSpan={4} style={{ padding: "var(--space-1) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          {day.hiddenNoiseHops} GPS hop{day.hiddenNoiseHops === 1 ? "" : "s"} under 1 mile hidden
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: "var(--space-2) var(--space-3)" }}>Claim total</td>
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{monthSummary.claimMiles.toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}
