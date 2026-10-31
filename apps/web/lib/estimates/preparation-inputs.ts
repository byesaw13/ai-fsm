import type { PoolClient } from "pg";
import type { TrimPaintRate, WallPaintRate } from "@ai-fsm/domain";
import type { PriceBookHours } from "@/lib/estimates/prepare-quote";

/**
 * What Prepare Quote and Revise read besides the assessment: price book hours
 * the owner's wall painting pace (production rate 5012, TASK-184) and trim
 * pace (rate 5003, TASK-217), over the account's hours-per-day setting
 * (TASK-193). Run inside the estimate's account context.
 */
export async function loadPreparationInputs(
  client: Pick<PoolClient, "query">,
): Promise<{ priceBook: PriceBookHours[]; wallPaintRate: WallPaintRate | null; trimPaintRate: TrimPaintRate | null }> {
  const { rows: priceBook } = await client.query<PriceBookHours>(
    `SELECT code, name,
            labor_hours_low::float AS labor_hours_low,
            labor_hours_typical::float AS labor_hours_typical,
            labor_hours_high::float AS labor_hours_high
     FROM price_book WHERE is_active = true ORDER BY code`,
  );
  // Wall height is handled by the Craftsman height factors (TASK-228), not the
  // old 'vaulted_ceilings' modifier, so it is not counted twice.
  const { rows: pace } = await client.query<{ sqft_per_day: number }>(
    `SELECT r.base_rate::float AS sqft_per_day
     FROM production_rates r
     WHERE r.service_code = '5012' AND r.scope_component_key = 'wall_sqft' AND r.rate_unit = 'sqft_per_day'`,
  );
  // Trim pace (TASK-217): rate 5003, baseboard and casing.
  const { rows: trim } = await client.query<{ lf_per_day: number }>(
    `SELECT base_rate::float AS lf_per_day FROM production_rates
     WHERE service_code = '5003' AND scope_component_key = 'trim_linear_ft' AND rate_unit = 'linear_ft_per_day'`,
  );
  // Hours in a work day (TASK-193), for this account; 8 when unset.
  const { rows: day } = await client.query<{ hours_per_day: number }>(
    `SELECT hours_per_day::float AS hours_per_day FROM business_pricing_settings
     WHERE account_id = NULLIF(current_setting('app.current_account_id', true), '')::uuid`,
  );
  const hours_per_day = day[0]?.hours_per_day ?? 8;
  return {
    priceBook,
    trimPaintRate: trim[0] ? { linear_ft_per_day: trim[0].lf_per_day, hours_per_day } : null,
    wallPaintRate: pace[0] ? { sqft_per_day: pace[0].sqft_per_day, hours_per_day } : null,
  };
}
