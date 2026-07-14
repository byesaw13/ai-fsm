import type { PoolClient } from "pg";
import {
  DEFAULT_PRICING_SETTINGS,
  buildPricingRules,
  type BusinessPricingSettings,
  type PricingRules,
} from "@ai-fsm/domain";

export type { BusinessPricingSettings };

function num(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function rowToPricingSettings(
  row: Record<string, unknown> | null | undefined
): BusinessPricingSettings {
  if (!row) return { ...DEFAULT_PRICING_SETTINGS };
  return {
    labor_cost_cents_per_hour: Math.round(
      num(row.labor_cost_cents_per_hour, DEFAULT_PRICING_SETTINGS.labor_cost_cents_per_hour)
    ),
    labor_billing_cents_per_hour: Math.round(
      num(row.labor_billing_cents_per_hour, DEFAULT_PRICING_SETTINGS.labor_billing_cents_per_hour)
    ),
    margin_floor_pct: num(row.margin_floor_pct, DEFAULT_PRICING_SETTINGS.margin_floor_pct),
    ma_labor_rate_delta: num(row.ma_labor_rate_delta, DEFAULT_PRICING_SETTINGS.ma_labor_rate_delta),
    minimum_service_fee_cents: Math.round(
      num(row.minimum_service_fee_cents, DEFAULT_PRICING_SETTINGS.minimum_service_fee_cents)
    ),
    half_day_rate_cents: Math.round(
      num(row.half_day_rate_cents, DEFAULT_PRICING_SETTINGS.half_day_rate_cents)
    ),
    full_day_rate_cents: Math.round(
      num(row.full_day_rate_cents, DEFAULT_PRICING_SETTINGS.full_day_rate_cents)
    ),
  };
}

/** Load settings; auto-seed row if missing (new accounts). */
export async function loadPricingSettings(
  client: PoolClient,
  accountId: string
): Promise<BusinessPricingSettings> {
  const existing = await client.query(
    `SELECT * FROM business_pricing_settings WHERE account_id = $1`,
    [accountId]
  );
  if ((existing.rowCount ?? 0) > 0) {
    return rowToPricingSettings(existing.rows[0] as Record<string, unknown>);
  }

  await client.query(
    `INSERT INTO business_pricing_settings (account_id) VALUES ($1)
     ON CONFLICT (account_id) DO NOTHING`,
    [accountId]
  );
  const seeded = await client.query(
    `SELECT * FROM business_pricing_settings WHERE account_id = $1`,
    [accountId]
  );
  return rowToPricingSettings(seeded.rows[0] as Record<string, unknown> | undefined);
}

/** Convenience: settings → engine rules for estimate compute / guardrails. */
export async function loadPricingRules(
  client: PoolClient,
  accountId: string
): Promise<{ settings: BusinessPricingSettings; rules: PricingRules }> {
  const settings = await loadPricingSettings(client, accountId);
  return { settings, rules: buildPricingRules(settings) };
}
