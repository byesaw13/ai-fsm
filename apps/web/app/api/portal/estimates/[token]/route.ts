import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne, query, getPool } from "@/lib/db";
import { createJobFromEstimate, getAccountOwnerUserId } from "@/lib/estimates/create-job-db";
import { createApprovalArtifacts } from "@/lib/estimates/approve";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface EstimateRow extends Record<string, unknown> {
  id: string;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number | null;
  notes: string | null;
  expires_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  client_approved_name: string | null;
  client_name: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  account_name: string;
}

interface LineItemRow extends Record<string, unknown> {
  id: string;
  description: string;
  quantity: string;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const estimate = await queryOne<EstimateRow>(
    `SELECT
       e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
       e.deposit_cents, e.notes, e.expires_at, e.sent_at, e.responded_at,
       e.client_approved_name,
       c.name AS client_name,
       p.address AS property_address, p.city AS property_city,
       p.state AS property_state, p.zip AS property_zip,
       a.name AS account_name
     FROM estimates e
     JOIN clients c ON c.id = e.client_id
     JOIN accounts a ON a.id = e.account_id
     LEFT JOIN properties p ON p.id = e.property_id
     WHERE e.share_token = $1`,
    [token]
  );

  if (!estimate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lineItems = await query<LineItemRow>(
    `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
     FROM estimate_line_items
     WHERE estimate_id = $1 AND visible_to_customer = true
     ORDER BY sort_order`,
    [estimate.id]
  );

  return NextResponse.json({ estimate, lineItems });
}

const respondBody = z.object({
  action: z.enum(["approve", "decline"]),
  name: z.string().min(1).max(255).optional(),
  signature_svg: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const estimate = await queryOne<{
    id: string;
    status: string;
    account_id: string;
  } & Record<string, unknown>>(
    `SELECT id, status, account_id FROM estimates WHERE share_token = $1`,
    [token]
  );

  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!["sent", "approved", "declined"].includes(estimate.status)) {
    return NextResponse.json(
      { error: "This estimate cannot be responded to in its current state" },
      { status: 422 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = respondBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  const { action, name, signature_svg } = parsed.data;

  if (action === "approve" && !name) {
    return NextResponse.json({ error: "Name is required to approve" }, { status: 422 });
  }

  const newStatus = action === "approve" ? "approved" : "declined";

  const pool = getPool();
  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");

    await dbClient.query(
      `UPDATE estimates
       SET status = $1,
           client_approved_name = $2,
           client_signature_svg = $3,
           responded_at = now(),
           updated_at = now()
       WHERE id = $4`,
      [newStatus, name ?? null, signature_svg ?? null, estimate.id]
    );

    // On approval: set RLS context then create job + deposit invoice artifacts,
    // matching the behavior of the admin transition and email respond paths.
    // Each artifact step uses its own savepoint so one failure never rolls
    // back the customer's approval or the other artifacts.
    if (action === "approve") {
      const ownerId = await getAccountOwnerUserId(dbClient, estimate.account_id);
      if (ownerId) {
        // Set RLS session context so INSERT policies on jobs/invoices pass.
        await dbClient.query(
          `SELECT set_config('app.current_user_id', $1, true),
                  set_config('app.current_account_id', $2, true),
                  set_config('app.current_role', 'owner', true)`,
          [ownerId, estimate.account_id]
        );

        // Auto-create job (non-fatal)
        await dbClient.query("SAVEPOINT before_auto_job");
        try {
          await createJobFromEstimate({
            client: dbClient,
            estimateId: estimate.id,
            accountId: estimate.account_id,
            createdBy: ownerId,
          });
          await dbClient.query("RELEASE SAVEPOINT before_auto_job");
        } catch (jobErr) {
          await dbClient.query("ROLLBACK TO SAVEPOINT before_auto_job");
          await dbClient.query("RELEASE SAVEPOINT before_auto_job");
          logger.error("portal approval: auto-create job failed (non-fatal)", jobErr);
        }

        // Create deposit invoice + action item (non-fatal)
        await dbClient.query("SAVEPOINT before_artifacts");
        try {
          await createApprovalArtifacts(dbClient, {
            estimateId: estimate.id,
            accountId: estimate.account_id,
            userId: ownerId,
          });
          await dbClient.query("RELEASE SAVEPOINT before_artifacts");
        } catch (artifactErr) {
          await dbClient.query("ROLLBACK TO SAVEPOINT before_artifacts");
          await dbClient.query("RELEASE SAVEPOINT before_artifacts");
          logger.error("portal approval: auto-create artifacts failed (non-fatal)", artifactErr);
        }
      }
    }

    await dbClient.query("COMMIT");
  } catch (err) {
    await dbClient.query("ROLLBACK");
    throw err;
  } finally {
    dbClient.release();
  }

  return NextResponse.json({ status: newStatus });
}
