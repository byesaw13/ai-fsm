import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { withEstimateContext } from "@/lib/estimates/db";
import type { EstimateStatus } from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  FilterBar,
  ItemCard,
  StatusSection,
  EmptyState,
  StatusBadge,
  LinkButton,
  MetricGrid,
} from "@/components/ui";
import type { FilterDef, StatusVariant, MetricCardData } from "@/components/ui";

export const dynamic = "force-dynamic";

interface EstimateRow {
  id: string;
  status: EstimateStatus;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  sent_at: string | null;
  expires_at: string | null;
  created_at: string;
  client_name: string | null;
  job_title: string | null;
}

const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
  expired: "Expired",
};

const STATUS_ORDER: EstimateStatus[] = [
  "sent",
  "draft",
  "approved",
  "declined",
  "expired",
];

const ESTIMATE_FILTERS: FilterDef[] = [
  {
    name: "q",
    type: "text",
    label: "Search",
    placeholder: "Client name or notes…",
  },
  {
    name: "status",
    type: "select",
    label: "Status",
    options: STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
  },
];

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function EstimatesPage({ searchParams }: PageProps) {
  const { q, status } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const canCreate = canCreateEstimates(session.role);

  const searchPattern = q ? `%${q.toLowerCase()}%` : null;
  const statusFilter =
    status && (STATUS_ORDER as string[]).includes(status) ? status : null;

  const estimates = await withEstimateContext(session, async (client) => {
    const conditions: string[] = ["e.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (searchPattern) {
      conditions.push(
        `(LOWER(c.name) LIKE $${idx} OR LOWER(COALESCE(e.notes, '')) LIKE $${idx})`
      );
      params.push(searchPattern);
      idx++;
    }
    if (statusFilter) {
      conditions.push(`e.status = $${idx}`);
      params.push(statusFilter);
      idx++;
    }

    const r = await client.query(
      `SELECT e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
              e.sent_at, e.expires_at, e.created_at,
              c.name AS client_name,
              j.title AS job_title
       FROM estimates e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY e.created_at DESC
       LIMIT 100`,
      params
    );
    return r.rows as EstimateRow[];
  });

  const hasFilter = !!(q || statusFilter);
  const currentValues: Record<string, string> = {};
  if (q) currentValues.q = q;
  if (status) currentValues.status = status;

  // Compute metrics
  const now = Date.now();
  const pendingEstimates = estimates.filter(
    (e) => e.status === "draft" || e.status === "sent"
  );
  const wonEstimates = estimates.filter((e) => e.status === "approved");
  const hasExpired = estimates.some(
    (e) =>
      e.status === "sent" &&
      e.expires_at &&
      new Date(e.expires_at).getTime() < now
  );
  const totalValue = estimates.reduce((sum, e) => sum + e.total_cents, 0);
  const pendingValue = pendingEstimates.reduce(
    (sum, e) => sum + e.total_cents,
    0
  );
  const wonValue = wonEstimates.reduce((sum, e) => sum + e.total_cents, 0);

  const metrics: MetricCardData[] = [
    {
      label: "Total Pipeline",
      value: formatDollars(totalValue),
      sub: `${estimates.length} estimates`,
    },
    {
      label: "Pending",
      value: formatDollars(pendingValue),
      sub: `${pendingEstimates.length} awaiting response`,
      variant: hasExpired ? "alert" : "default",
    },
    {
      label: "Won",
      value: formatDollars(wonValue),
      sub: `${wonEstimates.length} approved`,
      variant: wonEstimates.length > 0 ? "success" : "default",
    },
  ];

  // Group by status for unfiltered view
  const grouped = STATUS_ORDER.reduce<Record<string, EstimateRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  if (!hasFilter) {
    for (const est of estimates) {
      grouped[est.status]?.push(est);
    }
  }
  const activeStatuses = hasFilter
    ? []
    : STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <PageContainer>
      <PageHeader
        title="Estimates"
        subtitle={`${estimates.length} ${hasFilter ? "matching" : "total"}`}
        actions={
          canCreate ? (
            <LinkButton
              href="/app/estimates/new"
              variant="primary"
              data-testid="create-estimate-btn"
            >
              + New Estimate
            </LinkButton>
          ) : undefined
        }
      />

      {estimates.length > 0 && !hasFilter && (
        <MetricGrid metrics={metrics} />
      )}

      <FilterBar
        filters={ESTIMATE_FILTERS}
        baseHref="/app/estimates"
        currentValues={currentValues}
        submitLabel="Filter"
      />

      {estimates.length === 0 ? (
        <EmptyState
          title={
            hasFilter ? "No estimates match your filters" : "No estimates yet"
          }
          description={
            hasFilter
              ? "Try adjusting your search or filters."
              : "Create your first estimate to start quoting work."
          }
          action={
            canCreate && !hasFilter ? (
              <LinkButton href="/app/estimates/new" variant="primary">
                Create First Estimate
              </LinkButton>
            ) : undefined
          }
          data-testid="estimates-empty"
        />
      ) : hasFilter ? (
        <div>
          {estimates.map((est) => (
            <EstimateItemCard key={est.id} est={est} />
          ))}
        </div>
      ) : (
        <div>
          {activeStatuses.map((s) => (
            <StatusSection
              key={s}
              title={STATUS_LABELS[s as EstimateStatus]}
              count={grouped[s].length}
            >
              {grouped[s].map((est) => (
                <EstimateItemCard key={est.id} est={est} />
              ))}
            </StatusSection>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function EstimateItemCard({ est }: { est: EstimateRow }) {
  const now = Date.now();
  const isExpired =
    est.expires_at && new Date(est.expires_at).getTime() < now;
  const isExpiringSoon =
    !isExpired &&
    est.expires_at &&
    new Date(est.expires_at).getTime() < now + 7 * 24 * 60 * 60 * 1000;

  const meta = (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {est.job_title && (
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {est.job_title}
        </span>
      )}
      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        {formatDollars(est.total_cents)}
      </span>
      {est.expires_at && est.status === "sent" && (
        <span
          style={{
            color: isExpired
              ? "var(--color-danger)"
              : isExpiringSoon
              ? "var(--color-warning)"
              : "var(--fg-muted)",
            fontSize: "var(--text-sm)",
          }}
        >
          {isExpired ? "Expired: " : "Expires: "}
          {new Date(est.expires_at).toLocaleDateString()}
        </span>
      )}
    </div>
  );

  return (
    <ItemCard
      href={`/app/estimates/${est.id}`}
      title={est.client_name ?? "Unknown client"}
      meta={meta}
      overdue={!!(isExpired && est.status === "sent")}
      actions={
        <StatusBadge variant={est.status as StatusVariant}>
          {STATUS_LABELS[est.status]}
        </StatusBadge>
      }
      data-testid="estimate-card"
    />
  );
}
