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
  [key: string]: unknown;
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

const FUNNEL_STAGES: { status: EstimateStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "sent", label: "Sent" },
  { status: "approved", label: "Won" },
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

  const totalValue = estimates.reduce((sum, e) => sum + e.total_cents, 0);
  const pendingValue = grouped.sent.reduce((sum, e) => sum + e.total_cents, 0);
  const wonValue = grouped.approved.reduce((sum, e) => sum + e.total_cents, 0);

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

      {estimates.length > 0 && (
        <>
          <div className="grid metrics-grid">
            <div className="card metric-card">
              <p className="muted">Total Value</p>
              <p className="metric-value">{formatDollars(totalValue)}</p>
            </div>
            <div className="card metric-card">
              <p className="muted">Pending</p>
              <p className="metric-value">{formatDollars(pendingValue)}</p>
              <p className="metric-sub">{grouped.sent.length} awaiting response</p>
            </div>
            <div className="card metric-card metric-success">
              <p className="muted">Won</p>
              <p className="metric-value">{formatDollars(wonValue)}</p>
              <p className="metric-sub">{grouped.approved.length} approved</p>
            </div>
          </div>

          <div className="funnel-bar">
            {FUNNEL_STAGES.map((stage, idx) => {
              const count = grouped[stage.status].length;
              const pct = estimates.length > 0 ? Math.round((count / estimates.length) * 100) : 0;
              return (
                <div key={stage.status} className="funnel-stage">
                  <div className="funnel-label">{stage.label}</div>
                  <div className="funnel-bar-container">
                    <div
                      className={`funnel-bar-fill funnel-fill-${stage.status}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="funnel-count">
                    {count} <span className="funnel-pct">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {estimates.length === 0 ? (
        <div className="empty-state" data-testid="estimates-empty">
          <div className="empty-state-icon">📝</div>
          <p className="empty-state-title">No estimates yet</p>
          <p className="empty-state-desc">Create your first estimate to start quoting work.</p>
          {canCreate && (
            <Link href="/app/estimates/new" className="btn btn-primary">
              Create First Estimate
            </Link>
          )}
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
                {grouped[status].map((est) => {
                  const isExpiringSoon = est.expires_at && 
                    new Date(est.expires_at).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000;
                  const isExpired = est.expires_at && new Date(est.expires_at) < new Date();
                  
                  return (
                    <Link
                      key={est.id}
                      href={{ pathname: `/app/estimates/${est.id}` }}
                      className={`job-card ${isExpired && est.status === 'sent' ? 'overdue-card' : ''}`}
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
                      {est.expires_at && est.status === 'sent' && (
                        <p className={`job-date ${isExpiringSoon ? 'text-warning' : ''} ${isExpired ? 'text-danger' : ''}`}>
                          {isExpired ? 'Expired: ' : 'Expires: '}
                          {new Date(est.expires_at).toLocaleDateString()}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
