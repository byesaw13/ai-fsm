import { Client } from "pg";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenancePlan {
  id: string;
  account_id: string;
  client_id: string;
  property_id: string | null;
  name: string;
  frequency: "monthly" | "quarterly" | "biannual" | "annual";
  services: string[];
  price_cents: number;
  included_labor_minutes_per_visit: number;
  status: "active" | "paused" | "cancelled";
  next_scheduled_date: string | null;
  last_generated_at: string | null;
  notes: string | null;
}

// Cache account owner lookups within a scheduling run to avoid repeated queries
const ownerCache = new Map<string, string>();

async function getAccountOwner(client: Client, accountId: string): Promise<string> {
  if (ownerCache.has(accountId)) return ownerCache.get(accountId)!;
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE account_id = $1 AND role = 'owner' LIMIT 1`,
    [accountId]
  );
  if (!rows[0]) throw new Error(`No owner found for account ${accountId}`);
  ownerCache.set(accountId, rows[0].id);
  return rows[0].id;
}

export interface MaintenancePlanResult {
  planId: string;
  planName: string;
  visitId: string | null;
  action: "created" | "skipped_already_today" | "skipped_no_date" | "skipped_paused" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function advanceDateByFrequency(
  date: Date,
  frequency: string
): Date {
  const day = date.getDate();
  const next = new Date(date);
  switch (frequency) {
    case "monthly":
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setDate(1);
      next.setMonth(next.getMonth() + 3);
      break;
    case "biannual":
      next.setDate(1);
      next.setMonth(next.getMonth() + 6);
      break;
    case "annual":
      next.setDate(1);
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  // Clamp to last day of the resulting month (e.g. Jan 31 + 1mo → Feb 28, not Mar 3)
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, daysInMonth));
  return next;
}

// ---------------------------------------------------------------------------
// Find due maintenance plans
// ---------------------------------------------------------------------------

async function findDuePlans(client: Client): Promise<MaintenancePlan[]> {
  const { rows } = await client.query<MaintenancePlan>(
    `SELECT id, account_id, client_id, property_id, name, frequency,
            services, price_cents, status, next_scheduled_date::text,
            included_labor_minutes_per_visit,
            last_generated_at::text, notes
     FROM maintenance_plans
     WHERE status = 'active'
       AND next_scheduled_date IS NOT NULL
       AND next_scheduled_date <= CURRENT_DATE
       AND (last_generated_at IS NULL OR last_generated_at::date < CURRENT_DATE)
     ORDER BY next_scheduled_date ASC`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Create a visit from a maintenance plan
// ---------------------------------------------------------------------------

async function createPlanVisit(
  client: Client,
  plan: MaintenancePlan,
  actorId: string
): Promise<string> {
  // Calculate a 2-hour window starting at 9 AM on the scheduled date
  const scheduledDate = plan.next_scheduled_date
    ? new Date(plan.next_scheduled_date)
    : new Date();
  const startHour = 9;
  const scheduledStart = new Date(scheduledDate);
  scheduledStart.setHours(startHour, 0, 0, 0);
  const scheduledEnd = new Date(scheduledStart);
  scheduledEnd.setHours(startHour + 2, 0, 0, 0);

  // Find or create a job for this plan
  let jobId: string | null = null;
  const existingJob = await client.query<{ id: string }>(
    `SELECT id FROM jobs
     WHERE account_id = $1
       AND client_id = $2
       AND title = $3
       AND status IN ('draft', 'quoted', 'scheduled', 'in_progress')
     ORDER BY created_at DESC
     LIMIT 1`,
    [plan.account_id, plan.client_id, plan.name]
  );

  if ((existingJob.rowCount ?? 0) > 0) {
    jobId = existingJob.rows[0].id;
  } else {
    const newJob = await client.query<{ id: string }>(
      `INSERT INTO jobs
         (account_id, client_id, property_id, title, status, job_type, created_by)
       VALUES ($1, $2, $3, $4, 'scheduled', 'maintenance', $5)
       RETURNING id`,
      [plan.account_id, plan.client_id, plan.property_id, plan.name, actorId]
    );
    jobId = newJob.rows[0].id;
  }

  // Create the visit
  const visit = await client.query<{ id: string }>(
    `INSERT INTO visits
       (account_id, job_id, assigned_user_id,
        scheduled_start, scheduled_end, status,
        generated_from_plan_id, included_labor_cap_minutes)
     VALUES ($1, $2, NULL, $3, $4, 'scheduled', $5, $6)
     RETURNING id`,
    [
      plan.account_id,
      jobId,
      scheduledStart.toISOString(),
      scheduledEnd.toISOString(),
      plan.id,
      plan.included_labor_minutes_per_visit,
    ]
  );

  return visit.rows[0].id;
}

// ---------------------------------------------------------------------------
// Main: process all due maintenance plans
// ---------------------------------------------------------------------------

export async function processMaintenanceScheduling(
  client: Client
): Promise<MaintenancePlanResult[]> {
  const plans = await findDuePlans(client);
  const results: MaintenancePlanResult[] = [];

  if (plans.length === 0) {
    return results;
  }

  logger.info("maintenance-scheduling: found due plans", { count: plans.length });

  ownerCache.clear();

  for (const plan of plans) {
    try {
      const actorId = await getAccountOwner(client, plan.account_id);
      const visitId = await createPlanVisit(client, plan, actorId);

      // Advance next_scheduled_date and record last_generated_at
      const currentDate = new Date();
      const nextDate = advanceDateByFrequency(currentDate, plan.frequency);

      await client.query(
        `UPDATE maintenance_plans
         SET next_scheduled_date = $1,
             last_generated_at = now(),
             last_status = 'visit_created'
         WHERE id = $2`,
        [nextDate.toISOString().split("T")[0], plan.id]
      );

      // Write audit log
      await client.query(
        `INSERT INTO audit_log
           (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
         VALUES ($1, 'maintenance_plan', $2, 'insert', $3, NULL, $4)`,
        [
          plan.account_id,
          plan.id,
          actorId,
          JSON.stringify({
            plan_id: plan.id,
            plan_name: plan.name,
            visit_id: visitId,
            next_scheduled_date: nextDate.toISOString().split("T")[0],
            generated_at: new Date().toISOString(),
          }),
        ]
      );

      results.push({
        planId: plan.id,
        planName: plan.name,
        visitId,
        action: "created",
      });
    } catch (error) {
      const err = error as Error;
      logger.error("maintenance-scheduling: failed to process plan", error, {
        planId: plan.id,
        planName: plan.name,
      });
      results.push({
        planId: plan.id,
        planName: plan.name,
        visitId: null,
        action: "error",
        error: err.message,
      });
    }
  }

  return results;
}
