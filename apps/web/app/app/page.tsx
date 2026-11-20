import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { LinkButton, PageContainer, PageHeader } from "@/components/ui";
import { OwnerDashboard } from "./OwnerDashboard";
import type { CommandVisit } from "./DashboardWidgets";
import { loadNeedsAttention } from "@/lib/attention/load-needs-attention";
import { filterAttentionForSurface } from "@/lib/attention/surfaces";
import { formatBusinessDate } from "@/lib/time/business-tz";

export const dynamic = "force-dynamic";

type CountRow = { count: string };

function parseN(row: CountRow | undefined | null): number {
  return parseInt(row?.count ?? "0", 10);
}

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-work");

  const accountId = session.accountId;
  const todayLabel = formatBusinessDate(new Date(), { weekday: "long" });

  const [tomorrowJobs, outstandingInvoicesCentsRows, paidThisMonthCentsRows, attention] =
    await Promise.all([
      queryForSession<CommandVisit>(
        session,
        `SELECT DISTINCT ON (j.id)
                j.id, j.title, j.status,
                c.name AS client_name,
                p.address AS property_address,
                v.id AS visit_id,
                v.scheduled_start::text AS scheduled_start,
                v.status AS visit_status,
                v.sub_status
         FROM jobs j
         LEFT JOIN clients c ON c.id = j.client_id
         LEFT JOIN properties p ON p.id = j.property_id
         LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = j.account_id
         WHERE j.account_id = $1
           AND v.status IN ('scheduled','arrived','in_progress')
           AND timezone('America/New_York', v.scheduled_start)::date
             = (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date + 1
         ORDER BY j.id, v.scheduled_start ASC
         LIMIT 8`,
        [accountId],
      ),
      queryForSession<CountRow>(
        session,
        `SELECT COALESCE(SUM(total_cents - paid_cents), 0)::text AS count
         FROM invoices
         WHERE account_id = $1 AND status IN ('sent', 'partial', 'overdue')`,
        [accountId],
      ),
      queryForSession<CountRow>(
        session,
        `SELECT COALESCE(SUM(amount_cents), 0)::text AS count
         FROM payments
         WHERE account_id = $1 AND status = 'paid'
           AND received_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')`,
        [accountId],
      ),
      loadNeedsAttention(session),
    ]);

  const nowHour = new Date().getHours();
  const greeting =
    nowHour < 12 ? "Good morning" : nowHour < 17 ? "Good afternoon" : "Good evening";
  const deskItems = filterAttentionForSurface(attention.items, "desk");
  const leakCount = deskItems.length;
  const subtitle =
    leakCount === 0
      ? "Nothing leaking."
      : `${leakCount} item${leakCount === 1 ? "" : "s"} need you.`;

  return (
    <PageContainer>
      <PageHeader
        title={greeting}
        subtitle={subtitle}
        actions={
          <>
            <span
              style={{
                color: "var(--fg-muted)",
                fontSize: "var(--text-sm)",
                alignSelf: "center",
                marginRight: "var(--space-2)",
              }}
            >
              {todayLabel}
            </span>
            <LinkButton href="/app/my-work" variant="secondary" size="sm">
              Today
            </LinkButton>
            <LinkButton href="/app/intake/new" variant="primary" size="sm">
              + New Request
            </LinkButton>
          </>
        }
      />
      <OwnerDashboard
        leakItems={deskItems}
        openPromiseRows={attention.openPromiseRows}
        tomorrowJobs={tomorrowJobs}
        outstandingInvoicesCents={parseN(outstandingInvoicesCentsRows[0])}
        paidThisMonthCents={parseN(paidThisMonthCentsRows[0])}
      />
    </PageContainer>
  );
}
