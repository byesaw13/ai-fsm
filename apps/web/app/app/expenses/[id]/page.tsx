import Image from "next/image";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { withExpenseContext } from "@/lib/expenses/db";
import { canManageExpenses } from "@/lib/auth/permissions";
import { formatCentsToDollars } from "@/lib/expenses/math";
import { categoryLabel, formatExpenseDate } from "@/lib/expenses/ui";
import type { ExpenseCategory } from "@ai-fsm/domain";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  LinkButton,
  Card,
  SectionHeader,
} from "@/components/ui";
import { ExpenseEditForm } from "./ExpenseEditForm";
import { LinkedDocuments } from "@/components/documents/LinkedDocuments";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const canManage = canManageExpenses(session.role);

  const expense = await withExpenseContext(session, async (client) => {
    const result = await client.query(
      `SELECT e.id, e.vendor_name, e.category, e.amount_cents,
              e.expense_date, e.job_id, e.client_id, e.property_id,
              e.notes, e.receipt_url, e.created_by, e.created_at, e.updated_at,
              j.title AS job_title, c.name AS client_name
       FROM expenses e
       LEFT JOIN jobs j ON j.id = e.job_id
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [id, session.accountId]
    );
    return result.rowCount === 0 ? null : result.rows[0];
  });

  if (!expense) notFound();

  const dateStr =
    typeof expense.expense_date === "string"
      ? expense.expense_date.slice(0, 10)
      : String(expense.expense_date);

  const cat = expense.category as ExpenseCategory;

  // Fetch jobs and clients for the edit form
  const { jobs, clients } = canManage
    ? await withExpenseContext(session, async (client) => {
        const [jobsResult, clientsResult] = await Promise.all([
          client.query<{ id: string; title: string }>(
            `SELECT id, title FROM jobs WHERE account_id = $1 AND status NOT IN ('cancelled') ORDER BY created_at DESC LIMIT 100`,
            [session.accountId]
          ),
          client.query<{ id: string; name: string }>(
            `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC LIMIT 100`,
            [session.accountId]
          ),
        ]);
        return { jobs: jobsResult.rows, clients: clientsResult.rows };
      })
    : { jobs: [], clients: [] };

  return (
    <PageContainer>
      <PageHeader
        title={expense.vendor_name}
        subtitle={`${EXPENSE_CATEGORY_LABELS[cat] ?? cat} · ${formatExpenseDate(dateStr)}`}
        actions={
          <LinkButton href={"/app/expenses" as Route} variant="ghost" size="sm">
            ← Expenses
          </LinkButton>
        }
      />

      <div className="p7-detail-layout">
        {/* Primary — expense details */}
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader title="Expense Details" />
            {expense.receipt_url && (
              <div style={{ marginBottom: "var(--space-4)" }}>
                <Image
                  src={`/api/v1/expenses/${expense.id}/receipt`}
                  alt="Receipt photo"
                  width={720}
                  height={480}
                  unoptimized
                  style={{
                    width: "100%",
                    height: "auto",
                    maxHeight: 360,
                    objectFit: "contain",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-subtle)",
                  }}
                />
              </div>
            )}
            <dl className="p7-detail-list">
              <div className="p7-detail-row">
                <dt>Amount</dt>
                <dd style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
                  {formatCentsToDollars(expense.amount_cents)}
                </dd>
              </div>
              <div className="p7-detail-row">
                <dt>Category</dt>
                <dd>{categoryLabel(cat)}</dd>
              </div>
              <div className="p7-detail-row">
                <dt>Date</dt>
                <dd>{formatExpenseDate(dateStr)}</dd>
              </div>
              {expense.job_title && (
                <div className="p7-detail-row">
                  <dt>Job</dt>
                  <dd>
                    <a
                      href={`/app/jobs/${expense.job_id}`}
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      {expense.job_title}
                    </a>
                  </dd>
                </div>
              )}
              {expense.client_name && (
                <div className="p7-detail-row">
                  <dt>Client</dt>
                  <dd>
                    <a
                      href={`/app/clients/${expense.client_id}`}
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      {expense.client_name}
                    </a>
                  </dd>
                </div>
              )}
              {expense.notes && (
                <div className="p7-detail-row">
                  <dt>Notes</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{expense.notes}</dd>
                </div>
              )}
              <div className="p7-detail-row">
                <dt>Recorded</dt>
                <dd>
                  {new Date(expense.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* Sidebar — edit form + document panel */}
        <div className="p7-detail-sidebar">
          {canManage && (
            <Card>
              <SectionHeader title="Edit Expense" />
              <ExpenseEditForm
                expense={{
                  id: expense.id,
                  vendor_name: expense.vendor_name,
                  category: cat,
                  amount_cents: expense.amount_cents,
                  expense_date: dateStr,
                  job_id: expense.job_id ?? null,
                  client_id: expense.client_id ?? null,
                  notes: expense.notes ?? null,
                }}
                jobs={jobs}
                clients={clients}
                categories={EXPENSE_CATEGORIES.map((c) => ({
                  value: c,
                  label: EXPENSE_CATEGORY_LABELS[c],
                }))}
              />
            </Card>
          )}

          {/* Document panel — visible to all roles */}
          <LinkedDocuments session={session} entityType="expense" entityId={id} />
        </div>
      </div>
    </PageContainer>
  );
}
