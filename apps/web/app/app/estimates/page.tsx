import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { withEstimateContext } from "@/lib/estimates/db";
import type { EstimateStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface EstimateRow {
  id: string;
  status: EstimateStatus;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  sent_at: string | null;
  expires_at: string | null;
  created_at: string;
  client_name: string | null;
}

const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
  expired: "Expired",
};

const STATUS_ORDER: EstimateStatus[] = [
  "sent",
  "draft",
  "approved",
  "declined",
  "expired",
];

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function EstimatesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const canCreate = canCreateEstimates(session.role);

  const estimates = await withEstimateContext(session, async (client) => {
    const r = await client.query(
      `SELECT e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
              e.sent_at, e.expires_at, e.created_at,
              c.name AS client_name
       FROM estimates e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.account_id = $1
       ORDER BY e.created_at DESC
       LIMIT 100`,
      [session.accountId]
    );
    return r.rows as EstimateRow[];
  });

  const grouped = STATUS_ORDER.reduce<Record<string, EstimateRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  for (const est of estimates) {
    grouped[est.status]?.push(est);
  }
  const activeStatuses = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Estimates</h1>
          <p className="page-subtitle">{estimates.length} total</p>
        </div>
        {canCreate && (
          <Link
            href={{ pathname: "/app/estimates/new" }}
            className="btn btn-primary"
            data-testid="create-estimate-btn"
          >
            + New Estimate
          </Link>
        )}
      </div>

      {estimates.length === 0 ? (
        <div className="empty-state" data-testid="estimates-empty">
          <p>No estimates yet. Create your first estimate to get started.</p>
        </div>
      ) : (
        <div className="status-sections">
          {activeStatuses.map((status) => (
            <section key={status} className="status-section">
              <h2 className="status-heading" data-status={status}>
                {STATUS_LABELS[status]}
                <span className="count-badge">{grouped[status].length}</span>
              </h2>
              <div className="job-list">
                {grouped[status].map((est) => (
                  <Link
                    key={est.id}
                    href={{ pathname: `/app/estimates/${est.id}` }}
                    className="job-card"
                    data-testid="estimate-card"
                    data-status={est.status}
                  >
                    <div className="job-card-header">
                      <span className="job-title">
                        {est.client_name ?? "Unknown client"}
                      </span>
                      <span className={`status-pill status-${est.status}`}>
                        {STATUS_LABELS[est.status]}
                      </span>
                    </div>
                    <p className="job-client">
                      {formatDollars(est.total_cents)}
                    </p>
                    {est.expires_at && (
                      <p className="job-date">
                        Expires:{" "}
                        {new Date(est.expires_at).toLocaleDateString()}
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
