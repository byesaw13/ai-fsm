import { NextRequest, NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ClientRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  account_name: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const client = await queryOne<ClientRow>(
    `SELECT c.id, c.name, c.email, a.name AS account_name
     FROM clients c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.portal_token = $1`,
    [token]
  );

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [estimates, invoices, plans, maintenanceJobs] = await Promise.all([
    query(
      `SELECT e.id, e.status, e.total_cents, e.sent_at, e.expires_at,
              e.share_token, p.address AS property_address
       FROM estimates e
       LEFT JOIN properties p ON p.id = e.property_id
       WHERE e.client_id = $1 AND e.status != 'draft'
       ORDER BY e.created_at DESC`,
      [client.id]
    ),
    query(
      `SELECT i.id, i.invoice_number, i.status, i.total_cents, i.paid_cents,
              i.due_date, i.share_token, p.address AS property_address
       FROM invoices i
       LEFT JOIN properties p ON p.id = i.property_id
       WHERE i.client_id = $1 AND i.status != 'draft'
       ORDER BY i.created_at DESC`,
      [client.id]
    ),
    query(
      `SELECT id, name, frequency, services, price_cents, status, next_scheduled_date, notes
       FROM maintenance_plans
       WHERE client_id = $1
       ORDER BY status, created_at DESC`,
      [client.id]
    ),
    query(
      `SELECT j.id, j.title, j.status,
              p.address AS property_address,
              MAX(v.completed_at)::text AS completed_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', v.id, 'status', v.status, 'completed_at', v.completed_at,
                    'tech_notes', v.tech_notes
                  ) ORDER BY v.scheduled_start
                ) FILTER (WHERE v.id IS NOT NULL),
                '[]'
              ) AS visits
       FROM jobs j
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN visits v ON v.job_id = j.id
       WHERE j.client_id = $1 AND j.job_type = 'maintenance' AND j.status = 'completed'
       GROUP BY j.id, p.address
       ORDER BY MAX(v.completed_at) DESC NULLS LAST
       LIMIT 20`,
      [client.id]
    ),
  ]);

  return NextResponse.json({
    client: { name: client.name, email: client.email, accountName: client.account_name },
    estimates,
    invoices,
    plans,
    maintenanceJobs,
  });
}
