import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageExpenses } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { PageContainer, PageHeader, LinkButton } from "@/components/ui";
import { ExpenseForm } from "./ExpenseForm";

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

  // Fetch jobs and clients for the link dropdowns
  const [jobs, clients] = await Promise.all([
    query<{ id: string; title: string }>(
      isMaterialRun
        ? `SELECT DISTINCT j.id, j.title
           FROM jobs j
           LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = j.account_id
           WHERE j.account_id = $1
             AND j.status NOT IN ('cancelled')
             AND (
               v.scheduled_start::date = CURRENT_DATE
               OR j.id = $2::uuid
             )
           ORDER BY j.title ASC
           LIMIT 100`
        : `SELECT id, title FROM jobs WHERE account_id = $1 AND status NOT IN ('cancelled') ORDER BY created_at DESC LIMIT 100`,
      isMaterialRun ? [session.accountId, defaultJobId ?? "00000000-0000-0000-0000-000000000000"] : [session.accountId]
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
