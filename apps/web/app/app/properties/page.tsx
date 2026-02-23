import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients, canTransitionJob } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { buildJobCreateHref, formatPropertyAddress } from "@/lib/crm/p7";
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

type PropertyRow = {
  id: string;
  client_id: string;
  client_name: string;
  name: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  job_count: number | string;
  visit_count: number | string;
};

type ClientOption = { id: string; name: string };

interface PageProps {
  searchParams: Promise<{ q?: string; client_id?: string }>;
}

export default async function PropertiesPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const [{ q, client_id }, clients] = await Promise.all([
    searchParams,
    query<ClientOption>(`SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`, [session.accountId]),
  ]);

  const search = (q ?? "").trim().toLowerCase();
  const params: unknown[] = [session.accountId];
  const conditions = ["p.account_id = $1"];
  let idx = 2;
  if (client_id) {
    conditions.push(`p.client_id = $${idx++}`);
    params.push(client_id);
  }
  if (search) {
    conditions.push(`(LOWER(p.address) LIKE $${idx} OR LOWER(COALESCE(p.name, '')) LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const properties = await query<PropertyRow>(
    `SELECT p.*, c.name AS client_name,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT v.id)::int AS visit_count
     FROM properties p
     JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
     LEFT JOIN jobs j ON j.property_id = p.id AND j.account_id = p.account_id
     LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = p.account_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY p.id, c.name
     ORDER BY c.name ASC, p.address ASC
     LIMIT 200`,
    params
  );

  const currentValues: Record<string, string> = {};
  if (q) currentValues.q = q;
  if (client_id) currentValues.client_id = client_id;

  const filters: FilterDef[] = [
    { name: "q", type: "text", label: "Search", placeholder: "Address, property, client…" },
    { name: "client_id", type: "select", label: "Client", options: clients.map((c) => ({ value: c.id, label: c.name })) },
  ];

  const canCreateJobs = canTransitionJob(session.role);
  const columns: DataTableColumn<PropertyRow>[] = [
    {
      key: "property",
      label: "Property",
      render: (row) => (
        <div>
          <Link href={`/app/properties/${row.id}` as Route} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
            {row.name?.trim() || row.address}
          </Link>
          <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{formatPropertyAddress(row)}</div>
        </div>
      ),
    },
    {
      key: "client",
      label: "Client",
      render: (row) => <Link href={`/app/clients/${row.client_id}` as Route} style={{ color: "var(--accent)", textDecoration: "none" }}>{row.client_name}</Link>,
    },
    {
      key: "jobs",
      label: "Jobs",
      align: "right",
      width: "100px",
      render: (row) => Number(row.job_count),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      width: "220px",
      render: (row) => (
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <LinkButton href={`/app/properties/${row.id}`} variant="secondary" size="sm">Open</LinkButton>
          {canCreateJobs ? <LinkButton href={buildJobCreateHref(row.client_id, row.id)} variant="ghost" size="sm">+ Job</LinkButton> : null}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Properties"
        subtitle={`${properties.length} propert${properties.length === 1 ? "y" : "ies"}`}
        actions={<LinkButton href="/app/properties/new" data-testid="create-property-btn">+ New Property</LinkButton>}
      />

      <FilterBar filters={filters} baseHref="/app/properties" currentValues={currentValues} />

      {properties.length === 0 ? (
        <EmptyState
          title={q || client_id ? "No properties match your filters" : "No properties yet"}
          description={q || client_id ? "Try adjusting filters or search." : "Add a property for a client to track service locations."}
          action={<LinkButton href="/app/properties/new">Create First Property</LinkButton>}
          data-testid="properties-empty"
        />
      ) : (
        <>
          <Card style={{ padding: 0 }}>
            <DataTable columns={columns} rows={properties} getKey={(r) => r.id} data-testid="properties-table" />
          </Card>
          <div style={{ marginTop: "var(--space-4)", display: "grid", gap: "var(--space-3)" }}>
            {properties.map((row) => (
              <ItemCard
                key={row.id}
                href={`/app/properties/${row.id}`}
                title={row.name?.trim() || row.address}
                meta={
                  <>
                    <div>{formatPropertyAddress(row)}</div>
                    <div>{row.client_name} • {Number(row.job_count)} jobs • {Number(row.visit_count)} visits</div>
                  </>
                }
              />
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}
