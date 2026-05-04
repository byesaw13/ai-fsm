import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import {
  Card,
  LinkButton,
  MetricGrid,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import type { MetricCardData } from "@/components/ui";

export const dynamic = "force-dynamic";

interface CountRow { count: string; [key: string]: unknown }

export default async function OwnerDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  const isOwnerOrAdmin = canManageClients(session.role);
  if (!isOwnerOrAdmin) redirect("/app");

  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    draftEstimates,
    sentEstimates,
    approvedNotScheduled,
    visitsThisWeek,
    readyToInvoice,
    openInvoices,
    overdueInvoices,
    expensesMissingJob,
  ] = await Promise.all([
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM estimates WHERE account_id = $1 AND status = 'draft'`,
      [session.accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM estimates WHERE account_id = $1 AND status = 'sent'`,
      [session.accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM jobs j
       WHERE j.account_id = $1 AND j.status IN ('quoted', 'draft')
         AND j.source_estimate_id IS NOT NULL
         AND j.source_estimate_id IN (SELECT id FROM estimates WHERE status = 'approved')
         AND NOT EXISTS (
           SELECT 1 FROM visits v WHERE v.job_id = j.id AND v.account_id = j.account_id AND v.scheduled_start IS NOT NULL
         )`,
      [session.accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1 AND scheduled_start >= $2 AND scheduled_start < $3`,
      [session.accountId, now.toISOString(), weekFromNow.toISOString()]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM jobs j
       WHERE j.account_id = $1 AND j.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.account_id = j.account_id AND i.status NOT IN ('paid', 'void')
         )`,
      [session.accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM invoices WHERE account_id = $1 AND status IN ('sent', 'partial')`,
      [session.accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM invoices
       WHERE account_id = $1 AND (status = 'overdue' OR (status = 'sent' AND due_date < $2))`,
      [session.accountId, now.toISOString()]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM expenses WHERE account_id = $1 AND job_id IS NULL`,
      [session.accountId]
    ),
  ]);

  const metrics: MetricCardData[] = [
    {
      label: "Draft Estimates",
      value: parseInt(draftEstimates[0]?.count || "0", 10),
      href: "/app/estimates?status=draft",
    },
    {
      label: "Sent — Awaiting Approval",
      value: parseInt(sentEstimates[0]?.count || "0", 10),
      href: "/app/estimates?status=sent",
    },
    {
      label: "Approved — Not Scheduled",
      value: parseInt(approvedNotScheduled[0]?.count || "0", 10),
      href: "/app/jobs?status=quoted",
    },
    {
      label: "Visits This Week",
      value: parseInt(visitsThisWeek[0]?.count || "0", 10),
      href: "/app/visits",
    },
    {
      label: "Ready to Invoice",
      value: parseInt(readyToInvoice[0]?.count || "0", 10),
      href: "/app/jobs?status=completed",
      variant: parseInt(readyToInvoice[0]?.count || "0", 10) > 0 ? "alert" : "default",
    },
    {
      label: "Open Invoices",
      value: parseInt(openInvoices[0]?.count || "0", 10),
      href: "/app/invoices?status=sent",
    },
    {
      label: "Overdue Invoices",
      value: parseInt(overdueInvoices[0]?.count || "0", 10),
      href: "/app/invoices?status=overdue",
      variant: parseInt(overdueInvoices[0]?.count || "0", 10) > 0 ? "alert" : "default",
    },
    {
      label: "Expenses Missing Job",
      value: parseInt(expensesMissingJob[0]?.count || "0", 10),
      href: "/app/expenses",
      variant: parseInt(expensesMissingJob[0]?.count || "0", 10) > 0 ? "alert" : "default",
    },
  ];

  return (
    <PageContainer>
      <PageHeader title="Command Center" />
      <p style={{ margin: "0 0 var(--space-6)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        Overview of what needs your attention across the business.
      </p>
      <MetricGrid metrics={metrics} />
    </PageContainer>
  );
}
