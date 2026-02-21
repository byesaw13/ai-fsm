import type { PoolClient } from "pg";
import { appendAuditLog } from "../db/audit";

export type AutomationRecord = {
  id: string;
  type: string;
  account_id: string;
  enabled: boolean;
  [key: string]: unknown;
};

export interface TriggerResult {
  success: true;
  id: string;
  triggered: boolean;
  message: string;
}

export interface TriggerError {
  success: false;
  code: "NOT_FOUND" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
  message: string;
}

export type TriggerResponse = TriggerResult | TriggerError;

export interface TriggerContext {
  accountId: string;
  userId: string;
  traceId: string;
}

export async function triggerAutomation(
  client: PoolClient,
  automationId: string,
  automation: AutomationRecord,
  context: TriggerContext
): Promise<void> {
  await client.query(
    `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
    [context.userId, context.accountId, "owner"]
  );

  await client.query(
    `UPDATE automations SET next_run_at = now(), updated_at = now() WHERE id = $1`,
    [automationId]
  );

  await appendAuditLog(client, {
    account_id: context.accountId,
    entity_type: "automation_run",
    entity_id: automationId,
    action: "insert",
    actor_id: context.userId,
    trace_id: context.traceId,
    new_value: {
      automation_id: automationId,
      automation_type: automation.type,
      triggered_by: "manual",
      triggered_at: new Date().toISOString(),
    },
  });
}

export function validateAutomationId(id: string | undefined): string | null {
  if (!id) {
    return null;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) ? id : null;
}

export function canTriggerAutomation(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function buildSuccessResponse(automationId: string, automationType: string): TriggerResult {
  return {
    success: true,
    id: automationId,
    triggered: true,
    message: `Automation ${automationType} queued to run`,
  };
}

export function buildErrorResponse(
  code: TriggerError["code"],
  message: string
): TriggerError {
  return { success: false, code, message };
}
