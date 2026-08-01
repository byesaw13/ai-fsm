import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { formatClientContact } from "@/lib/crm/normalization";
import { formatCents } from "@/lib/money";
import {
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  ItemCard,
  LinkButton,
  PageContainer,
  PageHeader,
  HubSubnav,
} from "@/components/ui";
import type { DataTableColumn, FilterDef } from "@/components/ui";
import { PEOPLE_HUB_LINKS } from "@/lib/navigation/hubs";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  company_name: string | null;
  created_at: string;
  property_count: number | string;
  /** All FSM projects for this client, including invoiced/completed. */
  job_count: number | string;
  /** Square customer directory: historical payment count (not FSM jobs). */
  transaction_count: number | string | null;
  lifetime_spend_cents: number | string | null;
  last_visit_at: string | null;
  square_customer_id: string | null;
};

function formatClientHistoryMeta(row: ClientRow): string {
  const jobs = Number(row.job_count) || 0;
  const props = Number(row.property_count) || 0;
  const sq = Number(row.transaction_count) || 0;
  const spend = Number(row.lifetime_spend_cents) || 0;
  const parts = [
    `${props} propert${props === 1 ? "y" : "ies"}`,
    `${jobs} project${jobs === 1 ? "" : "s"}`,
  ];
  if (sq > 0) parts.push(`${sq} Square txn${sq === 1 ? "" : "s"}`);
  if (spend > 0) parts.push(formatCents(spend));
  return parts.join(" · ");
}

const CLIENT_FILTERS: FilterDef[] = [
  { name: "q", type: "text", label: "Search", placeholder: "Name, email, phone…" },
];

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const { q } = await searchParams;
  const search = (q ?? "").trim().toLowerCase();
  const params: unknown[] = [session.accountId];
  const conditions = ["c.account_id = $1"];
  let idx = 2;
  if (search) {
    conditions.push(`(LOWER(c.name) LIKE $${idx} OR LOWER(COALESCE(c.email, '')) LIKE $${idx} OR LOWER(COALESCE(c.phone, '')) LIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const clients = await query<ClientRow>(
    `SELECT c.*,
            COUNT(DISTINCT p.id)::int AS property_count,
            COUNT(DISTINCT j.id)::int AS job_count
     FROM clients c
     LEFT JOIN properties p ON p.client_id = c.id AND p.account_id = c.account_id
     LEFT JOIN jobs j ON j.client_id = c.id AND j.account_id = c.account_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY c.id
     ORDER BY c.name ASC
     LIMIT 200`,
    params
  );

  const currentValues: Record<string, string> = {};
  if (q) currentValues.q = q;

  const columns: DataTableColumn<ClientRow>[] = [
    {
      key: "name",
      label: "Client",
      render: (row) => (
        <div>
          <Link href={`/app/clients/${row.id}` as Route} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
            {row.name}
          </Link>
          {row.company_name && (
            <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", fontStyle: "italic" }}>
              {row.company_name}
            </div>
          )}
          <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
            {formatClientContact(row)}
          </div>
        </div>
      ),
    },
    {
      key: "properties",
      label: "Properties",
      align: "right",
      render: (row) => Number(row.property_count),
      width: "120px",
    },
    {
      key: "jobs",
      label: "Projects",
      align: "right",
      // Includes draft through invoiced — every FSM job row for this client.
      render: (row) => Number(row.job_count),
      width: "90px",
    },
    {
      key: "square",
      label: "Square",
      align: "right",
      render: (row) => {
        const n = Number(row.transaction_count) || 0;
        if (n <= 0) {
          return <span style={{ color: "var(--fg-muted)" }}>—</span>;
        }
        return (
          <span title="Historical payments from Square customer export (not FSM projects)">
            {n}
          </span>
        );
      },
      width: "80px",
    },
    {
      key: "lifetime",
      label: "Lifetime $",
      align: "right",
      render: (row) => {
        const cents = Number(row.lifetime_spend_cents) || 0;
        if (cents <= 0) {
          return <span style={{ color: "var(--fg-muted)" }}>—</span>;
        }
        return (
          <span title="Lifetime spend from Square customer export">
            {formatCents(cents)}
          </span>
        );
      },
      width: "100px",
    },
    {
      key: "actions",
      label: "Actions",
      width: "200px",
      render: (row) => (
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <LinkButton href={`/app/clients/${row.id}`} variant="secondary" size="sm">
            Open
          </LinkButton>
          <LinkButton href={`/app/properties/new?client_id=${row.id}`} variant="ghost" size="sm">
            Add Property
          </LinkButton>
        </div>
      ),
      align: "right",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} client${clients.length === 1 ? "" : "s"} · Projects = work in this app (includes invoiced). Square = historical payments from Square export.`}
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <LinkButton href="/app/clients/import" variant="secondary">
              Import Square CSV
            </LinkButton>
            <LinkButton href="/app/clients/new" variant="primary" data-testid="create-client-btn">
              + New Client
            </LinkButton>
          </div>
        }
      />
      <HubSubnav hub="People" links={PEOPLE_HUB_LINKS} pathname="/app/clients" />

      <FilterBar filters={CLIENT_FILTERS} baseHref="/app/clients" currentValues={currentValues} />

      {clients.length === 0 ? (
        <EmptyState
          title={search ? "No clients match your search" : "No clients yet"}
          description={search ? "Try a different search term." : "Create your first client to start scheduling jobs and visits."}
          action={<LinkButton href="/app/clients/new">Create First Client</LinkButton>}
          data-testid="clients-empty"
        />
      ) : (
        <>
          <Card className="p7-only-desktop" style={{ padding: 0 }}>
            <DataTable columns={columns} rows={clients} getKey={(r) => r.id} data-testid="clients-table" />
          </Card>
          <div className="p7-only-mobile" style={{ marginTop: "var(--space-4)" }}>
            {clients.map((row) => (
              <ItemCard
                key={row.id}
                href={`/app/clients/${row.id}`}
                title={row.name}
                meta={
                  <>
                    {row.company_name && <div style={{ fontStyle: "italic" }}>{row.company_name}</div>}
                    <div>{formatClientContact(row)}</div>
                    <div>{formatClientHistoryMeta(row)}</div>
                  </>
                }
                data-testid="client-card"
              />
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}
