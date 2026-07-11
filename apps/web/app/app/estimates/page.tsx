import Link from "next/link";
import type { Route } from "next";
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
  StatusBadge,
  EmptyState,
  LinkButton,
  MetricGrid,
} from "@/components/ui";
import { formatCents } from "@/lib/money";
import type { FilterDef, StatusVariant, MetricCardData } from "@/components/ui";
import { EstimateBoard } from "./EstimateBoard";

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
  estimate_number: string | null;
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

type EstimateTier = "open" | "closed";

const ESTIMATE_TIER_STATUSES: Record<EstimateTier, EstimateStatus[]> = {
  open:   ["draft", "sent"],
  closed: ["approved", "declined", "expired"],
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
  searchParams: Promise<{ q?: string; status?: string; tier?: string; view?: string }>;
}


export default async function EstimatesPage({ searchParams }: PageProps) {
  const { q, status, tier, view } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-work"); // EPIC-006: techs have no estimate access

  const canCreate = canCreateEstimates(session.role);
  const isBoardView = view !== "list"; // default to Kanban Board view!

  const searchPattern = q ? `%${q.toLowerCase()}%` : null;
  const activeTier = (tier && tier in ESTIMATE_TIER_STATUSES) ? tier as EstimateTier : null;
  const statusFilter =
    status && (STATUS_ORDER as string[]).includes(status) ? status : null;
  const tierStatuses = activeTier && !statusFilter ? ESTIMATE_TIER_STATUSES[activeTier] : null;

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
    } else if (tierStatuses) {
      conditions.push(`e.status = ANY($${idx}::text[])`);
      params.push(tierStatuses);
      idx++;
    }

    const r = await client.query(
      `SELECT e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
              e.sent_at, e.expires_at, e.created_at, e.estimate_number,
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

  const hasFilter = !!(q || statusFilter || activeTier);
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
      value: formatCents(totalValue),
      sub: `${estimates.length} estimates`,
    },
    {
      label: "Pending",
      value: formatCents(pendingValue),
      sub: `${pendingEstimates.length} awaiting response`,
      variant: hasExpired ? "alert" : "default",
    },
    {
      label: "Won",
      value: formatCents(wonValue),
      sub: `${wonEstimates.length} approved`,
      variant: wonEstimates.length > 0 ? "success" : "default",
    },
  ];

  // Group by status for board column sorting
  const grouped = STATUS_ORDER.reduce<Record<string, EstimateRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  for (const est of estimates) {
    if (grouped[est.status]) {
      grouped[est.status].push(est);
    }
  }

  const activeStatuses = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <PageContainer>
      <PageHeader
        title="Estimates"
        subtitle={`${estimates.length} ${hasFilter ? "matching" : "total"}`}
        actions={
          canCreate ? (
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <LinkButton
                href="/app/estimates/quick"
                variant="secondary"
                data-testid="quick-estimate-btn"
              >
                ⚡ Quick Estimate
              </LinkButton>
              <LinkButton
                href="/app/estimates/new"
                variant="primary"
                data-testid="create-estimate-btn"
              >
                + New Estimate
              </LinkButton>
            </div>
          ) : undefined
        }
      />

      {estimates.length > 0 && (
        <MetricGrid metrics={metrics} />
      )}

      {/* View Toggle (List vs Board) & Tier tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          {([
            { key: "board", label: "📋 Board View" },
            { key: "list", label: "☰ List View" },
          ] as const).map(({ key, label }) => {
            const isActive = isBoardView ? key === "board" : key === "list";
            const params = new URLSearchParams();
            if (key !== "board") params.set("view", key);
            if (q) params.set("q", q);
            if (status) params.set("status", status);
            if (tier) params.set("tier", tier);
            const qs = params.toString();
            return (
              <Link
                key={key}
                href={`/app/estimates${qs ? `?${qs}` : ""}` as Route}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  textDecoration: "none",
                  background: isActive ? "var(--accent-subtle)" : "var(--bg-card)",
                  color: isActive ? "var(--accent)" : "var(--fg-muted)",
                  border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                  transition: "all var(--transition-base)"
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
        
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          {([
            { tier: null,      label: "All" },
            { tier: "open",    label: "Open" },
            { tier: "closed",  label: "Closed" },
          ] as { tier: EstimateTier | null; label: string }[]).map(({ tier: t, label }) => {
            const isActive = activeTier === t;
            const params = new URLSearchParams();
            if (t) params.set("tier", t);
            if (q) params.set("q", q);
            if (status) params.set("status", status);
            if (!isBoardView) params.set("view", "list");
            const qs = params.toString();
            return (
              <Link
                key={label}
                href={`/app/estimates${qs ? `?${qs}` : ""}` as Route}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-full)",
                  fontSize: "var(--text-xs)",
                  fontWeight: isActive ? 700 : 500,
                  textDecoration: "none",
                  background: isActive ? "var(--accent)" : "var(--bg-card)",
                  color: isActive ? "#fff" : "var(--fg-muted)",
                  border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

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
      ) : isBoardView ? (
        <EstimateBoard
          estimates={estimates}
          statusOrder={STATUS_ORDER}
          statusLabels={STATUS_LABELS}
          canDrag={canCreate}
        />
      ) : (
        <div>
          {hasFilter ? (
            <div>
              {estimates.map((est) => (
                <EstimateItemCard key={est.id} est={est} showStatus />
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
        </div>
      )}
    </PageContainer>
  );
}

function EstimateItemCard({ est, showStatus = false }: { est: EstimateRow; showStatus?: boolean }) {
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
      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", fontFamily: "var(--font-mono), 'SF Mono', monospace" }}>
        {formatCents(est.total_cents)}
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
      title={`${est.estimate_number ? `${est.estimate_number} · ` : ""}${est.client_name ?? "Unknown client"}`}
      meta={meta}
      overdue={!!(isExpired && est.status === "sent")}
      actions={
        showStatus ? (
          <StatusBadge variant={est.status as StatusVariant}>
            {STATUS_LABELS[est.status]}
          </StatusBadge>
        ) : undefined
      }
      data-testid="estimate-card"
    />
  );
}
