import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageExpenses } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { PageContainer, PageHeader, LinkButton } from "@/components/ui";
import { ExpenseForm } from "./ExpenseForm";
import {
  RECEIPT_LINKABLE_JOB_STATUS_SQL,
  receiptJobOrderSql,
} from "@/lib/expenses/open-jobs";

export const dynamic = "force-dynamic";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string; job?: string; client?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageExpenses(session.role)) redirect("/app/expenses");
  const params = (await searchParams) ?? {};
  const isMaterialRun = params.mode === "run";
  const defaultJobId = params.job;
  const defaultClientId = params.client;
  const nilUuid = "00000000-0000-0000-0000-000000000000";

  // Open / in-progress jobs only — closed jobs clutter receipt entry.
  // Always include defaultJobId when deep-linked from a job page.
  const [jobs, clients] = await Promise.all([
    query<{ id: string; title: string }>(
      isMaterialRun
        ? `SELECT j.id, j.title
           FROM jobs j
           WHERE j.account_id = $1
             AND (
               j.status IN (${RECEIPT_LINKABLE_JOB_STATUS_SQL})
               OR j.id = $2::uuid
             )
             AND (
               j.status = 'in_progress'
               OR j.id = $2::uuid
               OR EXISTS (
                 SELECT 1 FROM visits v
                 WHERE v.job_id = j.id AND v.account_id = j.account_id
                   AND v.scheduled_start::date = CURRENT_DATE
               )
             )
           ORDER BY ${receiptJobOrderSql("j")}
           LIMIT 100`
        : `SELECT id, title FROM jobs
           WHERE account_id = $1
             AND (
               status IN (${RECEIPT_LINKABLE_JOB_STATUS_SQL})
               OR id = $2::uuid
             )
           ORDER BY ${receiptJobOrderSql()}
           LIMIT 100`,
      [session.accountId, defaultJobId ?? nilUuid],
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC LIMIT 100`,
      [session.accountId]
    ),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title={isMaterialRun ? "Material Run" : "New Expense"}
        subtitle={isMaterialRun ? "Capture the receipt first, then save the supplier run" : "Record an expense for this account"}
        actions={
          <LinkButton href="/app/expenses" variant="ghost" size="sm">
            ← Back
          </LinkButton>
        }
      />
      <ExpenseForm
        jobs={jobs}
        clients={clients}
        defaultJobId={defaultJobId}
        defaultClientId={defaultClientId}
        mode={isMaterialRun ? "run" : "standard"}
      />
    </PageContainer>
  );
}
