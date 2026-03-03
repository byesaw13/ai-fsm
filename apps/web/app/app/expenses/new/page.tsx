import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageExpenses } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { PageContainer, PageHeader, LinkButton } from "@/components/ui";
import { ExpenseForm } from "./ExpenseForm";

export const dynamic = "force-dynamic";

export default async function NewExpensePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageExpenses(session.role)) redirect("/app/expenses");

  // Fetch jobs and clients for the link dropdowns
  const [jobs, clients] = await Promise.all([
    query<{ id: string; title: string }>(
      `SELECT id, title FROM jobs WHERE account_id = $1 AND status NOT IN ('cancelled') ORDER BY created_at DESC LIMIT 100`,
      [session.accountId]
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC LIMIT 100`,
      [session.accountId]
    ),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="New Expense"
        subtitle="Record an expense for this account"
        actions={
          <LinkButton href="/app/expenses" variant="ghost" size="sm">
            ← Back
          </LinkButton>
        }
      />
      <ExpenseForm jobs={jobs} clients={clients} />
    </PageContainer>
  );
}
