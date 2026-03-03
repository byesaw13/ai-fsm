import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withExpenseContext } from "@/lib/expenses/db";
import { canManageExpenses } from "@/lib/auth/permissions";
import { formatCentsToDollars } from "@/lib/expenses/math";
import {
  categoryLabel,
  currentMonthKey,
  formatExpenseDate,
  formatMonthLabel,
  recentMonthOptions,
} from "@/lib/expenses/ui";
import type { ExpenseCategory } from "@ai-fsm/domain";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  FilterBar,
  ItemCard,
  StatusSection,
  EmptyState,
  LinkButton,
  MetricGrid,
} from "@/components/ui";
import type { FilterDef, MetricCardData } from "@/components/ui";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ category?: string; month?: string }>;
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const { category: categoryParam, month: monthParam } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const canManage = canManageExpenses(session.role);
  const activeMonth = monthParam ?? currentMonthKey();

  // Validate category filter
  const categoryFilter =
    categoryParam && (EXPENSE_CATEGORIES as readonly string[]).includes(categoryParam)
      ? (categoryParam as ExpenseCategory)
      : null;

  const EXPENSE_FILTERS: FilterDef[] = [
    {
      name: "month",
      type: "select",
      label: "Month",
      options: recentMonthOptions(),
    },
    {
      name: "category",
      type: "select",
      label: "Category",
      options: EXPENSE_CATEGORIES.map((c) => ({
        value: c,
        label: EXPENSE_CATEGORY_LABELS[c],
      })),
    },
  ];

  const { expenses, summary } = await withExpenseContext(session, async (client) => {
    const conditions: string[] = [
      "e.account_id = $1",
      "e.expense_date >= $2::date",
      "e.expense_date < ($2::date + interval '1 month')",
    ];
    const params: unknown[] = [session.accountId, `${activeMonth}-01`];
    let idx = 3;

    if (categoryFilter) {
      conditions.push(`e.category = $${idx++}`);
      params.push(categoryFilter);
    }

    const rows = await client.query(
      `SELECT e.id, e.vendor_name, e.category, e.amount_cents,
              e.expense_date, e.job_id, e.notes,
              j.title AS job_title, c.name AS client_name
       FROM expenses e
       LEFT JOIN jobs j ON j.id = e.job_id
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT 200`,
      params
    );

    // Month summary (always for full month, ignoring category filter)
    const summaryResult = await client.query<{
      total_cents: string | null;
      count: string;
    }>(
      `SELECT SUM(amount_cents) AS total_cents, COUNT(*) AS count
       FROM expenses
       WHERE account_id = $1
         AND expense_date >= $2::date
         AND expense_date < ($2::date + interval '1 month')`,
      [session.accountId, `${activeMonth}-01`]
    );

    // Category breakdown for the selected month
    const categoryResult = await client.query<{
      category: string;
      total_cents: string;
    }>(
      `SELECT category, SUM(amount_cents) AS total_cents
       FROM expenses
       WHERE account_id = $1
         AND expense_date >= $2::date
         AND expense_date < ($2::date + interval '1 month')
       GROUP BY category
       ORDER BY total_cents DESC`,
      [session.accountId, `${activeMonth}-01`]
    );

    return {
      expenses: rows.rows,
      summary: {
        total_cents: parseInt(summaryResult.rows[0]?.total_cents ?? "0", 10),
        count: parseInt(summaryResult.rows[0]?.count ?? "0", 10),
        by_category: categoryResult.rows.map((r) => ({
          category: r.category as ExpenseCategory,
          total_cents: parseInt(r.total_cents, 10),
        })),
      },
    };
  });

  const currentValues: Record<string, string> = { month: activeMonth };
  if (categoryFilter) currentValues.category = categoryFilter;

  // Build top-3 category metrics for the MetricGrid
  const topCategories = summary.by_category.slice(0, 3);
  const metrics: MetricCardData[] = [
    {
      label: `${formatMonthLabel(activeMonth)} Total`,
      value: formatCentsToDollars(summary.total_cents),
      variant: summary.total_cents > 0 ? "default" : "default",
    },
    {
      label: "Expenses",
      value: String(summary.count),
    },
    ...topCategories.map(
      (ct): MetricCardData => ({
        label: categoryLabel(ct.category),
        value: formatCentsToDollars(ct.total_cents),
      })
    ),
  ];

  // Group by category for display when no category filter
  const grouped = new Map<string, typeof expenses>();
  for (const expense of expenses) {
    const key = expense.category as string;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(expense);
  }
  // Sort categories by total descending
  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const aTotal = grouped.get(a)!.reduce((s, e) => s + e.amount_cents, 0);
    const bTotal = grouped.get(b)!.reduce((s, e) => s + e.amount_cents, 0);
    return bTotal - aTotal;
  });

  return (
    <PageContainer>
      <PageHeader
        title="Expenses"
        subtitle={`${formatMonthLabel(activeMonth)} — ${formatCentsToDollars(summary.total_cents)} across ${summary.count} expense${summary.count === 1 ? "" : "s"}`}
        actions={
          canManage ? (
            <LinkButton href="/app/expenses/new" variant="primary" data-testid="create-expense-btn">
              + New Expense
            </LinkButton>
          ) : undefined
        }
      />

      {metrics.length > 0 && <MetricGrid metrics={metrics} />}

      <FilterBar
        filters={EXPENSE_FILTERS}
        baseHref="/app/expenses"
        currentValues={currentValues}
        submitLabel="Filter"
      />

      {expenses.length === 0 ? (
        <EmptyState
          title={categoryFilter ? "No expenses in this category" : "No expenses this month"}
          description={
            categoryFilter
              ? "Try selecting a different category or month."
              : canManage
                ? "Record your first expense for the month."
                : "No expenses have been recorded yet."
          }
          action={
            canManage && !categoryFilter ? (
              <LinkButton href="/app/expenses/new" variant="primary">
                + New Expense
              </LinkButton>
            ) : undefined
          }
          data-testid="expenses-empty"
        />
      ) : categoryFilter ? (
        // Flat list when category filtered
        <div>
          {expenses.map((expense) => (
            <ExpenseItemCard key={expense.id} expense={expense} />
          ))}
        </div>
      ) : (
        // Group by category when unfiltered
        <div>
          {sortedCategories.map((cat) => {
            const items = grouped.get(cat)!;
            const catTotal = items.reduce((s, e) => s + e.amount_cents, 0);
            return (
              <StatusSection
                key={cat}
                title={`${categoryLabel(cat as ExpenseCategory)} — ${formatCentsToDollars(catTotal)}`}
                count={items.length}
              >
                {items.map((expense) => (
                  <ExpenseItemCard key={expense.id} expense={expense} />
                ))}
              </StatusSection>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

type ExpenseRow = {
  id: string;
  vendor_name: string;
  category: string;
  amount_cents: number;
  expense_date: string;
  job_title: string | null;
  client_name: string | null;
  notes: string | null;
};

function ExpenseItemCard({ expense }: { expense: ExpenseRow }) {
  const dateStr =
    typeof expense.expense_date === "string"
      ? expense.expense_date.slice(0, 10)
      : String(expense.expense_date);

  const meta = (
    <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        {formatExpenseDate(dateStr)}
      </span>
      {expense.job_title && (
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {expense.job_title}
        </span>
      )}
      {expense.client_name && (
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {expense.client_name}
        </span>
      )}
    </div>
  );

  return (
    <ItemCard
      href={`/app/expenses/${expense.id}`}
      title={expense.vendor_name}
      meta={meta}
      actions={
        <span
          style={{
            fontWeight: "var(--font-semibold)",
            fontSize: "var(--text-sm)",
            color: "var(--fg-base)",
          }}
        >
          {formatCentsToDollars(expense.amount_cents)}
        </span>
      }
      data-testid="expense-card"
    />
  );
}
