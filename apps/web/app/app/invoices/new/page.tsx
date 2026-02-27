import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateInvoices } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { NewInvoiceForm } from "./NewInvoiceForm";

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
  searchParams: Promise<{ client_id?: string; job_id?: string }>;
}

export default async function NewInvoicePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateInvoices(session.role)) redirect("/app/invoices");

  const { client_id, job_id } = await searchParams;

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

  return (
    <PageContainer>
      <PageHeader title="New Invoice" backHref="/app/invoices" backLabel="Invoices" />
      <Card>
        <NewInvoiceForm
          clients={clients}
          jobs={jobs}
          properties={properties}
          initialClientId={client_id}
          initialJobId={job_id}
        />
      </Card>
    </PageContainer>
  );
}
