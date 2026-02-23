import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { formatClientContact } from "@/lib/crm/p7";
import {
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  ItemCard,
  LinkButton,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import type { DataTableColumn, FilterDef } from "@/components/ui";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  property_count: number | string;
  job_count: number | string;
};

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
      label: "Jobs",
      align: "right",
      render: (row) => Number(row.job_count),
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
        subtitle={`${clients.length} client${clients.length === 1 ? "" : "s"}`}
        actions={
          <LinkButton href="/app/clients/new" variant="primary" data-testid="create-client-btn">
            + New Client
          </LinkButton>
        }
      />

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
          <Card style={{ padding: 0 }}>
            <DataTable columns={columns} rows={clients} getKey={(r) => r.id} data-testid="clients-table" />
          </Card>
          <div className="p7-mobile-stack" style={{ marginTop: "var(--space-4)" }}>
            {clients.map((row) => (
              <ItemCard
                key={row.id}
                href={`/app/clients/${row.id}`}
                title={row.name}
                meta={
                  <>
                    <div>{formatClientContact(row)}</div>
                    <div>{Number(row.property_count)} properties • {Number(row.job_count)} jobs</div>
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
