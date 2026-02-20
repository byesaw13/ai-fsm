import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllJobs, canViewAllVisits } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

interface CountResult {
  count: string;
  [key: string]: unknown;
}

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const isAdmin = canViewAllJobs(session.role);
  const canViewAllVisits_ = canViewAllVisits(session.role);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [jobsCount, todayVisits, overdueInvoices] = await Promise.all([
    isAdmin
      ? query<CountResult>(
          `SELECT COUNT(*)::text as count FROM jobs WHERE account_id = $1`,
          [session.accountId]
        )
      : query<CountResult>(
          `SELECT COUNT(DISTINCT j.id)::text as count FROM jobs j JOIN visits v ON v.job_id = j.id WHERE j.account_id = $1 AND v.assigned_user_id = $2`,
          [session.accountId, session.userId]
        ),
    canViewAllVisits_
      ? query<CountResult>(
          `SELECT COUNT(*)::text as count FROM visits WHERE account_id = $1 AND scheduled_start >= $2 AND scheduled_start < $3`,
          [session.accountId, startOfToday.toISOString(), endOfToday.toISOString()]
        )
      : query<CountResult>(
          `SELECT COUNT(*)::text as count FROM visits WHERE account_id = $1 AND assigned_user_id = $2 AND scheduled_start >= $3 AND scheduled_start < $4`,
          [session.accountId, session.userId, startOfToday.toISOString(), endOfToday.toISOString()]
        ),
    isAdmin
      ? query<CountResult>(
          `SELECT COUNT(*)::text as count FROM invoices WHERE account_id = $1 AND status = 'overdue'`,
          [session.accountId]
        )
      : Promise.resolve([{ count: "0" } as CountResult]),
  ]);

  const stats = {
    jobs: parseInt(jobsCount[0]?.count || "0", 10),
    todayVisits: parseInt(todayVisits[0]?.count || "0", 10),
    overdueInvoices: parseInt(overdueInvoices[0]?.count || "0", 10),
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, <span className="role-badge" data-role={session.role}>{session.role}</span>
          </p>
        </div>
      </div>

      <div className="dashboard-grid">
        <Link href="/app/jobs" className="stat-card">
          <div className="stat-icon stat-icon-jobs">J</div>
          <div className="stat-content">
            <span className="stat-value">{stats.jobs}</span>
            <span className="stat-label">Jobs</span>
          </div>
        </Link>

        <Link href="/app/visits" className="stat-card">
          <div className="stat-icon stat-icon-visits">V</div>
          <div className="stat-content">
            <span className="stat-value">{stats.todayVisits}</span>
            <span className="stat-label">Today&apos;s Visits</span>
          </div>
        </Link>

        {isAdmin && (
          <Link href="/app/invoices" className="stat-card stat-card-alert">
            <div className="stat-icon stat-icon-alert">!</div>
            <div className="stat-content">
              <span className="stat-value">{stats.overdueInvoices}</span>
              <span className="stat-label">Overdue Invoices</span>
            </div>
          </Link>
        )}
      </div>

      <div className="quick-actions">
        <h2 className="section-title">Quick Actions</h2>
        <div className="action-buttons">
          {isAdmin && (
            <Link href="/app/jobs/new" className="btn btn-primary">
              + New Job
            </Link>
          )}
          <Link href="/app/jobs" className="btn btn-secondary">
            View Jobs
          </Link>
          <Link href="/app/visits" className="btn btn-secondary">
            View Visits
          </Link>
        </div>
      </div>
    </div>
  );
}
