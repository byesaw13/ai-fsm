import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { PageContainer, PageHeader } from "@/components/ui";
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

interface PageProps {
  searchParams: Promise<{ client_id?: string; job_id?: string; property_id?: string; vault_item_id?: string; pricing_mode?: "itemized" | "flat_rate" | "multi_option" }>;
}

export default async function NewEstimatePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app/estimates");

  const { client_id, job_id, property_id, vault_item_id, pricing_mode } = await searchParams;

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

  return (
    <PageContainer>
      <PageHeader title="New Estimate" backHref="/app/estimates" backLabel="Estimates" />
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
      />
    </PageContainer>
  );
}
