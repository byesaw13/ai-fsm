import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canTransitionJob } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { JobCreateForm } from "./JobCreateForm";
import { QuickBookButton } from "@/components/jobs/QuickBookButton";
import { Card, PageContainer, PageHeader, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Client {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface Property {
  id: string;
  address: string;
  client_id: string;
  [key: string]: unknown;
}

interface PageProps {
  searchParams: Promise<{ client_id?: string; property_id?: string }>;
}

export default async function NewJobPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canTransitionJob(session.role)) redirect("/app/jobs");
  const { client_id, property_id } = await searchParams;

  const [clients, properties] = await Promise.all([
    query<Client>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`,
      [session.accountId]
    ),
    query<Property>(
      `SELECT id, address, client_id FROM properties WHERE account_id = $1 ORDER BY address ASC`,
      [session.accountId]
    ),
  ]);

  return (
    <PageContainer>
      <PageHeader title="New Job" backHref="/app/jobs" backLabel="Jobs" />

      {/* Driveway lane — same capture as Today / FAB. House required. */}
      <Card>
        <SectionHeader title="Quick job" />
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: "-8px", marginBottom: "var(--space-3)" }}>
          Person, house, and today. Time and materials. No estimate.
        </p>
        <QuickBookButton
          className="p7-btn p7-btn-primary"
          style={{ minHeight: 48, fontWeight: 700 }}
        >
          + Job
        </QuickBookButton>
      </Card>

      {/* Full Setup — secondary path */}
      <Card id="full-setup" style={{ marginTop: "var(--space-4)" }}>
        <SectionHeader title="Full Setup" as="h2" />
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: "-8px", marginBottom: "var(--space-3)" }}>
          Set type, priority, and schedule upfront.
        </p>
        <JobCreateForm
          clients={clients}
          properties={properties}
          initialClientId={client_id}
          initialPropertyId={property_id}
        />
      </Card>
    </PageContainer>
  );
}
