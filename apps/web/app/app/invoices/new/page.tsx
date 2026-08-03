import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateInvoices } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { Breadcrumbs, Card, PageContainer, PageHeader, HubSubnav } from "@/components/ui";
import { MONEY_HUB_LINKS } from "@/lib/navigation/hubs";
import { NewInvoiceForm } from "./NewInvoiceForm";
import {
  prefillLineItemsFromTmActuals,
  resolveJobPricingMode,
} from "@/lib/invoices/prefill-from-job";

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

interface EstimateLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  sort_order: number;
  [key: string]: unknown;
}

interface PageProps {
  searchParams: Promise<{ client_id?: string; job_id?: string; approved_estimate_id?: string }>;
}

export default async function NewInvoicePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateInvoices(session.role)) redirect("/app/invoices");

  const { client_id, job_id, approved_estimate_id } = await searchParams;

  const [clients, jobs, properties] = await Promise.all([
    query<Client>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`,
      [session.accountId]
    ),
    query<Job>(
      `SELECT id, title, client_id FROM jobs WHERE account_id = $1 ORDER BY title ASC`,
      [session.accountId]
    ),
    query<Property>(
      `SELECT id, address, client_id FROM properties WHERE account_id = $1 ORDER BY address ASC`,
      [session.accountId]
    ),
  ]);

  // Prefer T&M actuals (tracked time + materials) when the project is time-and-materials.
  // Otherwise prefill from the approved estimate budget lines.
  let prefillLineItems: Array<{ description: string; quantity: string; unit_price: string }> | undefined;
  let prefillSource: "tm_actuals" | "estimate" | null = null;

  if (job_id) {
    const pricingMode = await resolveJobPricingMode(session.accountId, job_id);
    if (pricingMode === "hourly_internal") {
      const actuals = await prefillLineItemsFromTmActuals(session.accountId, job_id);
      if (actuals.length > 0) {
        prefillLineItems = actuals;
        prefillSource = "tm_actuals";
      }
    }
  }

  if (!prefillLineItems && approved_estimate_id) {
    const estimateItems = await query<EstimateLineItem>(
      `SELECT eli.description, eli.quantity, eli.unit_price_cents, eli.sort_order
       FROM estimate_line_items eli
       JOIN estimates e ON e.id = eli.estimate_id
       WHERE eli.estimate_id = $1
         AND e.account_id = $2
         AND e.status = 'approved'
         AND eli.option_id IS NULL
       ORDER BY eli.sort_order ASC`,
      [approved_estimate_id, session.accountId]
    );
    if (estimateItems.length > 0) {
      prefillLineItems = estimateItems.map((li) => ({
        description: li.description,
        quantity: String(li.quantity),
        unit_price: (li.unit_price_cents / 100).toFixed(2),
      }));
      prefillSource = "estimate";
    }
  }

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { href: "/app/invoices", label: "Invoices" },
          { label: "New invoice" },
        ]}
      />
      <PageHeader title="New Invoice" backHref="/app/invoices" backLabel="Invoices" />
      <HubSubnav hub="Money" links={MONEY_HUB_LINKS} pathname="/app/invoices" />
      <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        {prefillSource === "tm_actuals"
          ? "Prefilling from tracked time and materials on this T&M project — edit before sending."
          : "Prefill from a project when you can — line items and client stay editable."}
      </p>
      <Card>
        <NewInvoiceForm
          clients={clients}
          jobs={jobs}
          properties={properties}
          initialClientId={client_id}
          initialJobId={job_id}
          prefillLineItems={prefillLineItems}
        />
      </Card>
    </PageContainer>
  );
}
