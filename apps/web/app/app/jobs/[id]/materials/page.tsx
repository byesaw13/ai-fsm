import Link from "next/link";
import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession, queryOneForSession } from "@/lib/db";
import { withExpenseContext } from "@/lib/expenses/db";
import { fetchJobMaterialExpenses } from "@/lib/invoices/job-expenses";
import { canManageExpenses } from "@/lib/auth/permissions";
import {
  Breadcrumbs,
  Card,
  EmptyState,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import { JobMaterialsPanel } from "../JobMaterialsPanel";
import { BuyListClient, type BuyListLine } from "./BuyListClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function JobMaterialsPage({ params, searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") {
    // techs may view/toggle if they can open the job — keep access
  }

  const { id: jobId } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab = tabRaw === "purchases" ? "purchases" : "buy";

  const job = await queryOneForSession<{
    id: string;
    title: string;
    materials_plan_seeded_at: string | null;
    materials_plan_seed_estimate_id: string | null;
  }>(
    session,
    `SELECT id, title, materials_plan_seeded_at, materials_plan_seed_estimate_id
     FROM jobs WHERE id = $1 AND account_id = $2`,
    [jobId, session.accountId],
  );
  if (!job) notFound();

  // Techs: only jobs with an assigned visit (match project detail page).
  if (session.role === "tech") {
    const assigned = await queryOneForSession(
      session,
      `SELECT id FROM visits
       WHERE job_id = $1 AND account_id = $2 AND assigned_user_id = $3
       LIMIT 1`,
      [jobId, session.accountId, session.userId],
    );
    if (!assigned) notFound();
  }

  const lines = await queryForSession<BuyListLine>(
    session,
    `SELECT id, name, quantity, unit_label, store_section, status, source, notes
     FROM job_material_lines
     WHERE job_id = $1 AND account_id = $2
     ORDER BY sort_order ASC, created_at ASC`,
    [jobId, session.accountId],
  );

  const showPurchases = canManageExpenses(session.role) || session.role === "owner" || session.role === "admin";
  const expenses =
    tab === "purchases" && showPurchases
      ? await withExpenseContext(session, (client) =>
          fetchJobMaterialExpenses(client, session.accountId, jobId),
        )
      : [];

  const canEdit = session.role === "owner" || session.role === "admin";
  const canSeed = canEdit;

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/app/jobs" },
          { label: job.title, href: `/app/jobs/${jobId}` },
          { label: "Materials" },
        ]}
      />
      <PageHeader
        title="Materials"
        subtitle={job.title}
      />

      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
        }}
        role="tablist"
        aria-label="Materials sections"
      >
        <Link
          href={`/app/jobs/${jobId}/materials?tab=buy` as Route}
          data-testid="materials-tab-buy"
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: "var(--text-sm)",
            fontWeight: tab === "buy" ? 600 : 400,
            background: tab === "buy" ? "var(--accent)" : "var(--bg-subtle)",
            color: tab === "buy" ? "#fff" : "var(--fg)",
            textDecoration: "none",
          }}
        >
          Buy list ({lines.length})
        </Link>
        {showPurchases && (
          <Link
            href={`/app/jobs/${jobId}/materials?tab=purchases` as Route}
            data-testid="materials-tab-purchases"
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: "var(--text-sm)",
              fontWeight: tab === "purchases" ? 600 : 400,
              background: tab === "purchases" ? "var(--accent)" : "var(--bg-subtle)",
              color: tab === "purchases" ? "#fff" : "var(--fg)",
              textDecoration: "none",
            }}
          >
            Purchases
          </Link>
        )}
        <Link
          href={`/app/jobs/${jobId}` as Route}
          style={{
            marginLeft: "auto",
            fontSize: "var(--text-sm)",
            color: "var(--accent)",
            alignSelf: "center",
          }}
        >
          ← Back to project
        </Link>
      </div>

      {tab === "buy" ? (
        <Card>
          <SectionHeader title="Buy list" />
          <p
            style={{
              margin: "0 0 var(--space-3)",
              fontSize: "var(--text-sm)",
              color: "var(--fg-muted)",
            }}
          >
            What to purchase or pack for this job. Seed from the estimate when available; mark
            status as you buy and load the truck. This is not the receipts list.
          </p>
          <BuyListClient
            jobId={jobId}
            initialLines={lines}
            seededAt={job.materials_plan_seeded_at}
            canEdit={canEdit}
            canSeed={canSeed}
          />
        </Card>
      ) : (
        <Card>
          <SectionHeader title="Purchases" />
          <p
            style={{
              margin: "0 0 var(--space-3)",
              fontSize: "var(--text-sm)",
              color: "var(--fg-muted)",
            }}
          >
            Receipts and expenses linked to this job (actuals).
          </p>
          {expenses.length === 0 ? (
            <EmptyState
              title="No receipts linked"
              description="Log a material run or link expenses to this project to see purchases here."
            />
          ) : (
            <JobMaterialsPanel expenses={expenses} />
          )}
        </Card>
      )}
    </PageContainer>
  );
}
