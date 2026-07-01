/**
 * Promote an assessment draft work order or create a default one when an
 * estimate is accepted and linked to a project.
 */

import type { PoolClient } from "pg";
import { seedCompletionCriteriaFromLineItems } from "@ai-fsm/domain";
import { deriveJobTitle, deriveJobDescription } from "../estimates/job-from-estimate";

export interface PromoteWorkOrderResult {
  workOrderId: string;
  created: boolean;
  promoted: boolean;
}

interface EstimateContext {
  id: string;
  client_id: string;
  property_id: string | null;
  notes: string | null;
  total_cents: number;
  client_name: string | null;
  property_address: string | null;
}

/**
 * Idempotent: returns existing WO for this estimate/project if already linked.
 */
export async function promoteOrCreateWorkOrderFromEstimate({
  client,
  estimateId,
  jobId,
  accountId,
  createdBy,
}: {
  client: PoolClient;
  estimateId: string;
  jobId: string;
  accountId: string;
  createdBy: string;
}): Promise<PromoteWorkOrderResult> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM work_orders
     WHERE account_id = $1 AND job_id = $2 AND source_estimate_id = $3
       AND status <> 'cancelled'
     LIMIT 1`,
    [accountId, jobId, estimateId],
  );
  if (existing.rows[0]) {
    return { workOrderId: existing.rows[0].id, created: false, promoted: false };
  }

  const estRes = await client.query<EstimateContext>(
    `SELECT e.id, e.client_id, e.property_id, e.notes, e.total_cents,
            c.name AS client_name, p.address AS property_address
     FROM estimates e
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN properties p ON p.id = e.property_id
     WHERE e.id = $1 AND e.account_id = $2`,
    [estimateId, accountId],
  );
  const est = estRes.rows[0];
  if (!est) {
    throw Object.assign(new Error("Estimate not found"), { code: "NOT_FOUND" });
  }

  const draftRes = await client.query<{ id: string }>(
    `SELECT wo.id
     FROM work_orders wo
     WHERE wo.account_id = $1
       AND wo.status = 'draft'
       AND wo.job_id IS NULL
       AND wo.client_id = $2
       AND ($3::uuid IS NULL OR wo.property_id = $3 OR wo.property_id IS NULL)
       AND (
         wo.source_assessment_id IN (
           SELECT a.id FROM site_visit_assessments a
           JOIN visits sv ON sv.id = a.visit_id
           LEFT JOIN jobs sj ON sj.id = sv.job_id
           WHERE a.account_id = $1
             AND ($3::uuid IS NULL OR sj.property_id = $3 OR wo.property_id = $3)
         )
         OR wo.source_visit_id IN (
           SELECT v.id FROM visits v
           LEFT JOIN jobs j ON j.id = v.job_id
           WHERE v.account_id = $1 AND v.visit_type = 'site_visit'
             AND ($3::uuid IS NULL OR j.property_id = $3)
         )
       )
     ORDER BY wo.created_at DESC
     LIMIT 1`,
    [accountId, est.client_id, est.property_id],
  );

  const lineItemsRes = await client.query<{
    description: string;
    line_item_type: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }>(
    `SELECT description, line_item_type, quantity, unit_price_cents, total_cents
     FROM estimate_line_items
     WHERE estimate_id = $1
     ORDER BY sort_order ASC`,
    [estimateId],
  );

  const completionCriteria = seedCompletionCriteriaFromLineItems(lineItemsRes.rows);
  const materialsTotal = lineItemsRes.rows
    .filter((li) => li.line_item_type === "materials")
    .reduce((s, m) => s + m.total_cents, 0);

  if (draftRes.rows[0]) {
    const woId = draftRes.rows[0].id;
    await client.query(
      `UPDATE work_orders SET
         job_id = $3,
         property_id = COALESCE(property_id, $4),
         status = 'ready',
         source_estimate_id = $5,
         completion_criteria = CASE
           WHEN completion_criteria = '[]'::jsonb THEN $6::jsonb
           ELSE completion_criteria
         END,
         updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [woId, accountId, jobId, est.property_id, estimateId, JSON.stringify(completionCriteria)],
    );
    return { workOrderId: woId, created: false, promoted: true };
  }

  const title = deriveJobTitle({
    notes: est.notes,
    property_address: est.property_address,
    client_name: est.client_name,
    total_cents: est.total_cents,
  });
  const scope = deriveJobDescription({
    notes: est.notes,
    property_address: est.property_address,
    client_name: est.client_name,
    total_cents: est.total_cents,
  });

  const insertRes = await client.query<{ id: string }>(
    `INSERT INTO work_orders
       (account_id, client_id, job_id, property_id, title, scope, status,
        total_cents, source_estimate_id, completion_criteria, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'ready', $7, $8, $9::jsonb, $10)
     RETURNING id`,
    [
      accountId,
      est.client_id,
      jobId,
      est.property_id,
      title,
      scope,
      materialsTotal,
      estimateId,
      JSON.stringify(completionCriteria),
      createdBy,
    ],
  );
  const workOrderId = insertRes.rows[0].id;

  for (let i = 0; i < lineItemsRes.rows.length; i++) {
    const li = lineItemsRes.rows[i];
    if (li.line_item_type !== "materials") continue;
    await client.query(
      `INSERT INTO work_order_materials
         (work_order_id, description, quantity, unit_price_cents, total_cents, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [workOrderId, li.description, li.quantity, li.unit_price_cents, li.total_cents, i],
    );
  }

  return { workOrderId, created: true, promoted: false };
}