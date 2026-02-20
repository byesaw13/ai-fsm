import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllVisits } from "@/lib/auth/permissions";
import type { Visit, VisitStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

type VisitRow = Visit & {
  job_title: string | null;
  assigned_user_name: string | null;
  client_name: string | null;
  property_address: string | null;
};

const STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_ORDER: VisitStatus[] = [
  "in_progress",
  "arrived",
  "scheduled",
  "completed",
  "cancelled",
];

function formatVisitDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default async function VisitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllVisits(session.role);

  let visits: VisitRow[];
  if (isAdmin) {
    visits = await query<VisitRow>(
      `SELECT
          v.*,
          j.title AS job_title,
          u.full_name AS assigned_user_name,
          c.name AS client_name,
          p.address AS property_address
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN users u ON u.id = v.assigned_user_id
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1
       ORDER BY v.scheduled_start ASC
       LIMIT 200`,
      [session.accountId]
    );
  } else {
    // tech: only assigned visits
    visits = await query<VisitRow>(
      `SELECT
          v.*,
          j.title AS job_title,
          u.full_name AS assigned_user_name,
          c.name AS client_name,
          p.address AS property_address
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN users u ON u.id = v.assigned_user_id
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1 AND v.assigned_user_id = $2
       ORDER BY v.scheduled_start ASC
       LIMIT 200`,
      [session.accountId, session.userId]
    );
  }

  const grouped = STATUS_ORDER.reduce<Record<string, VisitRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  for (const visit of visits) {
    grouped[visit.status]?.push(visit);
  }

  const activeStatuses = STATUS_ORDER.filter((s) => grouped[s].length > 0);
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const unassigned = visits.filter((v) => !v.assigned_user_id);
  const todayVisits = visits.filter((v) => {
    const ts = new Date(v.scheduled_start).getTime();
    return ts >= startOfToday.getTime() && ts < endOfToday.getTime();
  });
  const activeVisits = visits.filter(
    (v) => v.status === "in_progress" || v.status === "arrived"
  );
  const overdueScheduled = visits.filter((v) => {
    const ts = new Date(v.scheduled_start).getTime();
    return ts < now && (v.status === "scheduled" || v.status === "arrived");
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Visits</h1>
          <p className="page-subtitle">
            {isAdmin
              ? `All visits — ${visits.length} total`
              : `Your assigned visits — ${visits.length} total`}
          </p>
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="grid">
            <div className="card">
              <p className="muted">Needs Assignment</p>
              <p className="metric-value">{unassigned.length}</p>
            </div>
            <div className="card">
              <p className="muted">Today</p>
              <p className="metric-value">{todayVisits.length}</p>
            </div>
            <div className="card">
              <p className="muted">Active Now</p>
              <p className="metric-value">{activeVisits.length}</p>
            </div>
            <div className="card">
              <p className="muted">Overdue Scheduled</p>
              <p className="metric-value">{overdueScheduled.length}</p>
            </div>
          </div>

          <div className="grid">
            <section className="card">
              <h2 className="status-heading">
                Needs Assignment
                <span className="count-badge">{unassigned.length}</span>
              </h2>
              {unassigned.length === 0 ? (
                <p className="muted">No unassigned visits.</p>
              ) : (
                <div className="visit-list">
                  {unassigned.slice(0, 8).map((visit) => (
                    <Link
                      key={visit.id}
                      href={`/app/visits/${visit.id}`}
                      className="visit-card"
                    >
                      <div className="visit-card-header">
                        <span className="visit-date">{formatVisitDate(visit.scheduled_start)}</span>
                        <span className={`status-pill status-${visit.status}`}>
                          {STATUS_LABELS[visit.status]}
                        </span>
                      </div>
                      <p className="visit-job">{visit.job_title ?? "Untitled job"}</p>
                      {visit.client_name && <p className="muted">{visit.client_name}</p>}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <h2 className="status-heading">
                Today
                <span className="count-badge">{todayVisits.length}</span>
              </h2>
              {todayVisits.length === 0 ? (
                <p className="muted">No visits scheduled for today.</p>
              ) : (
                <div className="visit-list">
                  {todayVisits.slice(0, 8).map((visit) => (
                    <Link
                      key={visit.id}
                      href={`/app/visits/${visit.id}`}
                      className="visit-card"
                    >
                      <div className="visit-card-header">
                        <span className="visit-date">{formatVisitDate(visit.scheduled_start)}</span>
                        <span className={`status-pill status-${visit.status}`}>
                          {STATUS_LABELS[visit.status]}
                        </span>
                      </div>
                      <p className="visit-job">{visit.job_title ?? "Untitled job"}</p>
                      {visit.assigned_user_name ? (
                        <p className="muted">Tech: {visit.assigned_user_name}</p>
                      ) : (
                        <p className="unassigned-badge">Unassigned</p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {visits.length === 0 ? (
        <div className="empty-state" data-testid="visits-empty">
          <p>
            {isAdmin
              ? "No visits scheduled yet."
              : "No visits assigned to you."}
          </p>
        </div>
      ) : (
        <div className="status-sections">
          {activeStatuses.map((status) => (
            <section key={status} className="status-section">
              <h2 className="status-heading" data-status={status}>
                {STATUS_LABELS[status as VisitStatus]}
                <span className="count-badge">{grouped[status].length}</span>
              </h2>
              <div className="visit-list">
                {grouped[status].map((visit) => (
                  <Link
                    key={visit.id}
                    href={`/app/visits/${visit.id}`}
                    className="visit-card"
                    data-testid="visit-card"
                    data-status={visit.status}
                  >
                    <div className="visit-card-header">
                      <span className="visit-date">{formatVisitDate(visit.scheduled_start)}</span>
                      <span className={`status-pill status-${visit.status}`}>
                        {STATUS_LABELS[visit.status as VisitStatus]}
                      </span>
                    </div>
                    {visit.job_title && (
                      <p className="visit-job">{visit.job_title}</p>
                    )}
                    {visit.client_name && (
                      <p className="muted">Client: {visit.client_name}</p>
                    )}
                    {visit.property_address && (
                      <p className="muted">Property: {visit.property_address}</p>
                    )}
                    {isAdmin && visit.assigned_user_name && (
                      <p className="muted">Tech: {visit.assigned_user_name}</p>
                    )}
                    {isAdmin && !visit.assigned_user_name && (
                      <p className="unassigned-badge" data-testid="unassigned-badge">
                        Unassigned
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
