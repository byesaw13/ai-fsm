import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { EstimateEntryShell } from "./EstimateEntryShell";

export const dynamic = "force-dynamic";

interface Client {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface Job {
  id: string;
  title: string;
  client_id: string;
  [key: string]: unknown;
}

interface Property {
  id: string;
  address: string;
  client_id: string;
  [key: string]: unknown;
}

interface WalkthroughContext extends Record<string, unknown> {
  id: string;
  scheduled_start: string;
  tech_notes: string | null;
  job_id: string | null;
  job_title: string | null;
  client_name: string | null;
  property_address: string | null;
  assessment_photo_count: number;
  before_photo_count: number;
  part_count: number;
}

interface PageProps {
  searchParams: Promise<{
    client_id?: string;
    job_id?: string;
    property_id?: string;
    vault_item_id?: string;
    from_visit?: string;
    pricing_mode?: "itemized" | "flat_rate" | "multi_option";
  }>;
}

export default async function NewEstimatePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app/estimates");

  const { client_id, job_id, property_id, vault_item_id, from_visit, pricing_mode } = await searchParams;

  const [clients, jobs, properties] = await Promise.all([
    query<Client>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`,
      [session.accountId]
    ),
    query<Job>(
      `SELECT id, title, client_id FROM jobs WHERE account_id = $1 AND status NOT IN ('completed','cancelled','invoiced') ORDER BY title ASC`,
      [session.accountId]
    ),
    query<Property>(
      `SELECT id, address, client_id FROM properties WHERE account_id = $1 ORDER BY address ASC`,
      [session.accountId]
    ),
  ]);

  // Fetch vault item context for pre-populating estimate notes
  let vaultItemContext: { name: string; category: string; location: string | null } | null = null;
  if (vault_item_id) {
    const rows = await query<{ name: string; category: string; location: string | null }>(
      `SELECT name, category, location FROM property_vault_items WHERE id = $1 AND account_id = $2`,
      [vault_item_id, session.accountId]
    );
    vaultItemContext = rows[0] ?? null;
  }

  let walkthroughContext: WalkthroughContext | null = null;
  if (from_visit) {
    walkthroughContext = await queryOne<WalkthroughContext>(
      `SELECT v.id, v.scheduled_start, v.tech_notes,
              v.job_id, j.title AS job_title,
              c.name AS client_name,
              p.address AS property_address,
              (SELECT COUNT(*)::int FROM visit_media vm
               WHERE vm.visit_id = v.id AND vm.account_id = v.account_id AND vm.category = 'assessment') AS assessment_photo_count,
              (SELECT COUNT(*)::int FROM visit_media vm
               WHERE vm.visit_id = v.id AND vm.account_id = v.account_id AND vm.category = 'before') AS before_photo_count,
              (SELECT COUNT(*)::int FROM visit_parts vp
               WHERE vp.visit_id = v.id AND vp.account_id = v.account_id) AS part_count
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id AND j.account_id = v.account_id
       LEFT JOIN clients c ON c.id = j.client_id AND c.account_id = v.account_id
       LEFT JOIN properties p ON p.id = j.property_id AND p.account_id = v.account_id
       WHERE v.id = $1 AND v.account_id = $2 AND v.visit_type = 'site_visit'`,
      [from_visit, session.accountId]
    );
  }

  return (
    <PageContainer>
      <PageHeader title="New Estimate" backHref="/app/estimates" backLabel="Estimates" />
      {walkthroughContext && (
        <Card style={{ marginBottom: "var(--space-4)" }} data-testid="walkthrough-estimate-context">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <div style={{ minWidth: 240, flex: "1 1 320px" }}>
              <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Walkthrough Evidence
              </p>
              <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-lg)" }}>
                {walkthroughContext.job_title ?? "Site visit"}
              </h2>
              <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                {walkthroughContext.client_name ?? "Client"}{walkthroughContext.property_address ? ` · ${walkthroughContext.property_address}` : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: "var(--text-sm)" }}><strong>{walkthroughContext.assessment_photo_count}</strong> assessment photos</div>
              <div style={{ fontSize: "var(--text-sm)" }}><strong>{walkthroughContext.before_photo_count}</strong> before photos</div>
              <div style={{ fontSize: "var(--text-sm)" }}><strong>{walkthroughContext.part_count}</strong> parts</div>
            </div>
          </div>
          {walkthroughContext.tech_notes && (
            <p style={{ margin: "var(--space-3) 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)", whiteSpace: "pre-wrap" }}>
              {walkthroughContext.tech_notes}
            </p>
          )}
        </Card>
      )}
      <EstimateEntryShell
        clients={clients}
        jobs={jobs}
        properties={properties}
        initialClientId={client_id}
        initialJobId={job_id}
        initialPropertyId={property_id}
        initialVaultItemId={vault_item_id}
        vaultItemContext={vaultItemContext}
        initialPricingMode={pricing_mode ?? "itemized"}
        initialMode={walkthroughContext ? "manual" : undefined}
      />
    </PageContainer>
  );
}
