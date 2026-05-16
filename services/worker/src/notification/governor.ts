import type { Client } from "pg";
import { COOLDOWN_BYPASS_MINIMUM } from "./priority.js";

interface AutomationRules {
  cooldown_hours: number;
  max_per_day: number;
  working_hours_start: number;
  working_hours_end: number;
  working_hours_tz: string;
}

interface NotificationRow {
  id: string;
  account_id: string;
  client_id: string | null;
  priority: number;
  to_address: string;
  attempt_count: number;
}

interface GovernorResult {
  ok: boolean;
  delayUntil?: Date;
  reason?: string;
}

function nextWorkingHoursStart(rules: AutomationRules): Date {
  const tz = rules.working_hours_tz;
  const now = new Date();

  // Get current hour in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "12");

  if (hour >= rules.working_hours_start && hour < rules.working_hours_end) {
    return now; // currently in window
  }

  // Calculate next window start — advance to tomorrow's start if already past end
  const day = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const year = parts.find((p) => p.type === "year")?.value;
  const base = new Date(`${year}-${month}-${day}T${String(rules.working_hours_start).padStart(2, "0")}:00:00`);

  // Convert from tz to UTC: build the date string with tz offset
  // Simple approximation: add 24h if we're past the end hour today
  if (hour >= rules.working_hours_end) {
    base.setDate(base.getDate() + 1);
  }
  return base;
}

export async function getRules(client: Client, accountId: string): Promise<AutomationRules> {
  const { rows } = await client.query<AutomationRules>(
    `SELECT cooldown_hours, max_per_day, working_hours_start, working_hours_end, working_hours_tz
     FROM automation_rules WHERE account_id = $1`,
    [accountId]
  );
  return rows[0] ?? {
    cooldown_hours: 4,
    max_per_day: 2,
    working_hours_start: 8,
    working_hours_end: 19,
    working_hours_tz: "America/New_York",
  };
}

export async function checkGovernor(
  client: Client,
  notification: NotificationRow,
  rules: AutomationRules
): Promise<GovernorResult> {
  const isCritical = notification.priority <= COOLDOWN_BYPASS_MINIMUM;

  // Working hours check (skip for CRITICAL/HIGH)
  if (notification.priority > COOLDOWN_BYPASS_MINIMUM) {
    const tz = rules.working_hours_tz;
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    const hourStr = formatter.format(new Date());
    const hour = parseInt(hourStr);

    if (hour < rules.working_hours_start || hour >= rules.working_hours_end) {
      const delayUntil = nextWorkingHoursStart(rules);
      return { ok: false, delayUntil, reason: "outside_working_hours" };
    }
  }

  // Cooldown check (skip for CRITICAL/HIGH)
  if (!isCritical && notification.client_id) {
    const cooldown = await client.query<{ last_sent_at: string }>(
      `SELECT last_sent_at FROM notification_cooldowns
       WHERE account_id = $1 AND client_id = $2`,
      [notification.account_id, notification.client_id]
    );
    if (cooldown.rows.length > 0) {
      const elapsed = (Date.now() - new Date(cooldown.rows[0].last_sent_at).getTime()) / 3_600_000;
      if (elapsed < rules.cooldown_hours) {
        // Delay to when cooldown expires
        const delayUntil = new Date(new Date(cooldown.rows[0].last_sent_at).getTime() + rules.cooldown_hours * 3_600_000);
        return { ok: false, delayUntil, reason: "cooldown" };
      }
    }
  }

  return { ok: true };
}

export async function updateCooldown(
  client: Client,
  accountId: string,
  clientId: string
): Promise<void> {
  await client.query(
    `INSERT INTO notification_cooldowns (account_id, client_id, last_sent_at)
     VALUES ($1, $2, now())
     ON CONFLICT (account_id, client_id) DO UPDATE SET last_sent_at = now()`,
    [accountId, clientId]
  );
}
