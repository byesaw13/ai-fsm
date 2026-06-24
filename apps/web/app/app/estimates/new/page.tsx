import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { EstimateEntryShell } from "./EstimateEntryShell";
import { buildWalkthroughScopeNotes } from "@/lib/estimates/walkthrough-prefill";
import { loadAssessmentSummary } from "@/lib/estimates/assessment-summary-loader";

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

interface BookingRequestRow extends Record<string, unknown> {
  id: string;
  service_description: string;
  service_category: string;
  property_id: string | null;
  routing_path: string | null;
  referral_source: string | null;
  review_notes: string | null;
}

interface PageProps {
  searchParams: Promise<{
    client_id?: string;
    job_id?: string;
    property_id?: string;
    vault_item_id?: string;
    from_visit?: string;
    pricing_mode?: "itemized" | "flat_rate" | "multi_option";
    booking_request_id?: string;
    from_assessment?: string;
    visit_id?: string;
  }>;
}

export default async function NewEstimatePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app/estimates");

  const { client_id, job_id, property_id, vault_item_id, from_visit, pricing_mode, booking_request_id, from_assessment, visit_id } = await searchParams;

  // TASK-018 slice 2: when opened from an assessment, recover the canonical
  // summary from persistence so a refresh / deep-link (no sessionStorage) still
  // carries the assessment context into estimate/materials.
  const serverAssessmentContext =
    from_assessment === "1" && visit_id
      ? await loadAssessmentSummary(session, visit_id)
      : null;

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

  // Fetch the source booking request (if any) to pre-populate the notes field.
  let bookingRequestContext: BookingRequestRow | null = null;
  if (booking_request_id) {
    const rows = await query<BookingRequestRow>(
      `SELECT id, service_description, service_category,
              property_id, routing_path, referral_source, review_notes
       FROM booking_requests
       WHERE id = $1 AND account_id = $2`,
      [booking_request_id, session.accountId]
    );
    bookingRequestContext = rows[0] ?? null;
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

  // Build the scope-notes prefill. Walkthrough evidence takes priority;
  // fall back to a richer booking request summary.
  let walkthroughPrefill = "";
  if (bookingRequestContext && !walkthroughContext) {
    const parts: string[] = [bookingRequestContext.service_description.trim()];
    if (bookingRequestContext.review_notes?.trim()) {
      parts.push(`Review notes: ${bookingRequestContext.review_notes.trim()}`);
    }
    if (bookingRequestContext.routing_path && bookingRequestContext.routing_path !== "pending") {
      parts.push(`Routing: ${bookingRequestContext.routing_path === "site_visit" ? "Site visit recommended" : "Remote estimate"}`);
    }
    walkthroughPrefill = parts.join("\n\n");
  }
  if (walkthroughContext) {
    const partRows = await query<{ name: string; quantity: number | string }>(
      `SELECT name, quantity FROM visit_parts
       WHERE visit_id = $1 AND account_id = $2
       ORDER BY created_at ASC`,
      [walkthroughContext.id, session.accountId]
    );
    walkthroughPrefill = buildWalkthroughScopeNotes({
      visitDate: typeof walkthroughContext.scheduled_start === "string"
        ? walkthroughContext.scheduled_start
        : null,
      techNotes: walkthroughContext.tech_notes,
      parts: partRows.map((p) => ({ name: p.name, quantity: Number(p.quantity) })),
      assessmentPhotoCount: walkthroughContext.assessment_photo_count,
      beforePhotoCount: walkthroughContext.before_photo_count,
    });
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
        initialPropertyId={property_id ?? bookingRequestContext?.property_id ?? undefined}
        initialVaultItemId={vault_item_id}
        vaultItemContext={vaultItemContext}
        initialPricingMode={pricing_mode}
        initialMode={walkthroughContext ? "quick" : undefined}
        initialNotes={walkthroughPrefill || undefined}
        bookingRequestId={bookingRequestContext?.id}
        serverAssessmentContext={serverAssessmentContext}
      />
    </PageContainer>
  );
}
