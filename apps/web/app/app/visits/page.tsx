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

export default async function VisitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllVisits(session.role);

  let visits: VisitRow[];
  if (isAdmin) {
    visits = await query<VisitRow>(
      `SELECT v.*, j.title AS job_title, u.full_name AS assigned_user_name
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN users u ON u.id = v.assigned_user_id
       WHERE v.account_id = $1
       ORDER BY v.scheduled_start ASC
       LIMIT 200`,
      [session.accountId]
    );
  } else {
    // tech: only assigned visits
    visits = await query<VisitRow>(
      `SELECT v.*, j.title AS job_title, u.full_name AS assigned_user_name
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN users u ON u.id = v.assigned_user_id
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
                      <span className="visit-date">
                        {new Date(visit.scheduled_start).toLocaleDateString()}{" "}
                        {new Date(visit.scheduled_start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className={`status-pill status-${visit.status}`}>
                        {STATUS_LABELS[visit.status as VisitStatus]}
                      </span>
                    </div>
                    {visit.job_title && (
                      <p className="visit-job">{visit.job_title}</p>
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
