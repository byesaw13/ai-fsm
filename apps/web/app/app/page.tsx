import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllJobs, canViewAllVisits } from "@/lib/auth/permissions";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricGrid, type MetricCardData } from "@/components/ui/MetricGrid";
import { RoleBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

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
  const isTech = session.role === "tech";

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

  const metrics: MetricCardData[] = [
    {
      label: isTech ? "My Jobs" : "Total Jobs",
      value: stats.jobs,
      href: "/app/jobs",
    },
    {
      label: "Today's Visits",
      value: stats.todayVisits,
      href: "/app/visits",
    },
    ...(isAdmin
      ? [
          {
            label: "Overdue Invoices",
            value: stats.overdueInvoices,
            href: "/app/invoices",
            variant: (stats.overdueInvoices > 0 ? "alert" : "default") as MetricCardData["variant"],
          },
        ]
      : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle={
          isTech ? "Your day at a glance" : "Operations overview"
        }
        actions={
          isAdmin ? (
            <LinkButton href="/app/jobs/new" variant="primary">
              + New Job
            </LinkButton>
          ) : undefined
        }
      >
        <RoleBadge variant={session.role as "owner" | "admin" | "tech"}>
          {session.role}
        </RoleBadge>
      </PageHeader>

      <MetricGrid metrics={metrics} />

      <div style={{ marginTop: "var(--space-4)" }}>
        <h2
          style={{
            fontSize: "var(--text-lg)",
            fontWeight: "var(--font-semibold)",
            margin: "0 0 var(--space-3)",
          }}
        >
          Quick Actions
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <LinkButton href="/app/jobs" variant="secondary">
            View Jobs
          </LinkButton>
          <LinkButton href="/app/visits" variant="secondary">
            View Visits
          </LinkButton>
          {isAdmin && (
            <>
              <LinkButton href="/app/estimates" variant="secondary">
                Estimates
              </LinkButton>
              <LinkButton href="/app/invoices" variant="secondary">
                Invoices
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
