import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { withExpenseContext } from "@/lib/expenses/db";
import { withDocumentContext, listDocumentLinks } from "@/lib/paperless/db";
import { canManageExpenses, canLinkDocuments } from "@/lib/auth/permissions";
import { isPaperlessEnabled } from "@/lib/paperless/client";
import { formatCentsToDollars } from "@/lib/expenses/math";
import { categoryLabel, formatExpenseDate } from "@/lib/expenses/ui";
import type { ExpenseCategory } from "@ai-fsm/domain";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  LinkButton,
} from "@/components/ui";
import { ExpenseEditForm } from "./ExpenseEditForm";
import { DocumentPanel } from "./DocumentPanel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const canManage = canManageExpenses(session.role);
  const canLink = canLinkDocuments(session.role);
  const paperlessEnabled = isPaperlessEnabled();

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

  // Fetch linked documents server-side for initial render
  const initialLinks = await withDocumentContext(session, (client) =>
    listDocumentLinks(client, session.accountId, "expense", id)
  );

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
          <div className="p7-card">
            <div className="p7-detail-list">
              <div className="p7-detail-row">
                <span className="p7-detail-row-label">Amount</span>
                <span
                  className="p7-detail-row-value"
                  style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}
                >
                  {formatCentsToDollars(expense.amount_cents)}
                </span>
              </div>
              <div className="p7-detail-row">
                <span className="p7-detail-row-label">Category</span>
                <span className="p7-detail-row-value">{categoryLabel(cat)}</span>
              </div>
              <div className="p7-detail-row">
                <span className="p7-detail-row-label">Date</span>
                <span className="p7-detail-row-value">{formatExpenseDate(dateStr)}</span>
              </div>
              {expense.job_title && (
                <div className="p7-detail-row">
                  <span className="p7-detail-row-label">Job</span>
                  <span className="p7-detail-row-value">
                    <a
                      href={`/app/jobs/${expense.job_id}`}
                      style={{ color: "var(--color-primary)", textDecoration: "none" }}
                    >
                      {expense.job_title}
                    </a>
                  </span>
                </div>
              )}
              {expense.client_name && (
                <div className="p7-detail-row">
                  <span className="p7-detail-row-label">Client</span>
                  <span className="p7-detail-row-value">
                    <a
                      href={`/app/clients/${expense.client_id}`}
                      style={{ color: "var(--color-primary)", textDecoration: "none" }}
                    >
                      {expense.client_name}
                    </a>
                  </span>
                </div>
              )}
              {expense.notes && (
                <div className="p7-detail-row" style={{ alignItems: "flex-start" }}>
                  <span className="p7-detail-row-label">Notes</span>
                  <span
                    className="p7-detail-row-value"
                    style={{ whiteSpace: "pre-wrap", textAlign: "left" }}
                  >
                    {expense.notes}
                  </span>
                </div>
              )}
              <div className="p7-detail-row">
                <span className="p7-detail-row-label">Recorded</span>
                <span className="p7-detail-row-value">
                  {new Date(expense.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar — edit form + document panel */}
        <div className="p7-detail-sidebar">
          {canManage && (
            <div className="p7-card">
              <div
                style={{
                  fontWeight: "var(--font-semibold)",
                  fontSize: "var(--text-sm)",
                  marginBottom: "var(--space-3)",
                  color: "var(--fg-muted)",
                }}
              >
                Edit Expense
              </div>
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
            </div>
          )}

          {/* Document panel — visible to all roles */}
          <DocumentPanel
            entityType="expense"
            entityId={id}
            initialLinks={initialLinks}
            paperlessEnabled={paperlessEnabled}
            canLink={canLink}
          />
        </div>
      </div>
    </PageContainer>
  );
}
