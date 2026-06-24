import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { queryForSession } from "@/lib/db";
import type { WorkOrderRoomLine } from "@ai-fsm/domain";
import { PageContainer, PageHeader, Card } from "@/components/ui";
import { WorkOrderForm, type MaterialRow } from "../WorkOrderForm";

export const dynamic = "force-dynamic";

type WorkOrderRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  property_id: string | null;
  property_address: string | null;
  job_id: string | null;
  title: string;
  scope: string | null;
  site_notes: string | null;
  safety_notes: string | null;
  rooms: unknown;
  status: string;
  total_cents: number;
  completed_at: string | null;
};

type MaterialDbRow = {
  description: string;
  quantity: number | string;
  unit_price_cents: number;
  total_cents: number;
};

const STATUSES = ["draft", "scheduled", "in_progress", "completed", "cancelled"] as const;

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app/work-orders");

  const rows = await queryForSession<WorkOrderRow>(
    session,
    `SELECT w.id, w.client_id, c.name AS client_name, w.property_id, p.address AS property_address,
            w.job_id, w.title, w.scope, w.site_notes, w.safety_notes, w.rooms, w.status,
            w.total_cents, w.completed_at::text
     FROM work_orders w
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN properties p ON p.id = w.property_id
     WHERE w.id = $1 AND w.account_id = $2`,
    [id, session.accountId],
  );
  const wo = rows[0];
  if (!wo) notFound();

  const matRows = await queryForSession<MaterialDbRow>(
    session,
    `SELECT description, quantity, unit_price_cents, total_cents
     FROM work_order_materials WHERE work_order_id = $1 ORDER BY sort_order ASC`,
    [id],
  );
  const materials: MaterialRow[] = matRows.map((m) => ({
    description: m.description,
    quantity: Number(m.quantity),
    unit_price_cents: m.unit_price_cents,
    total_cents: m.total_cents,
  }));

  const rooms: WorkOrderRoomLine[] = Array.isArray(wo.rooms)
    ? (wo.rooms as WorkOrderRoomLine[])
    : [];
  const status = (STATUSES as readonly string[]).includes(wo.status)
    ? (wo.status as (typeof STATUSES)[number])
    : "draft";

  return (
    <PageContainer>
      <PageHeader
        title={wo.title}
        subtitle={`${wo.status.replace("_", " ")}${wo.completed_at ? " · completed" : ""}`}
        backHref="/app/work-orders"
        backLabel="Work Orders"
      />
      <Card>
        <WorkOrderForm
          mode="edit"
          workOrderId={wo.id}
          clientId={wo.client_id}
          clientName={wo.client_name}
          propertyId={wo.property_id}
          propertyAddress={wo.property_address}
          jobId={wo.job_id}
          initial={{
            title: wo.title,
            scope: wo.scope ?? "",
            siteNotes: wo.site_notes ?? "",
            safetyNotes: wo.safety_notes ?? "",
            rooms,
            materials,
            status,
          }}
        />
      </Card>
    </PageContainer>
  );
}
