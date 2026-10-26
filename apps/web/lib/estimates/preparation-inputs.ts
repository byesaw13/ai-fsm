import type { PoolClient } from "pg";
import type { WallPaintRate } from "@ai-fsm/domain";
import type { PriceBookHours } from "@/lib/estimates/prepare-quote";

/**
 * What Prepare Quote and Revise read besides the assessment: price book hours
 * and the owner's wall painting pace (production rate 5012 and its tall-wall
 * modifier, TASK-184). Run inside the estimate's account context.
 */
export async function loadPreparationInputs(
  client: Pick<PoolClient, "query">,
): Promise<{ priceBook: PriceBookHours[]; wallPaintRate: WallPaintRate | null }> {
  const { rows: priceBook } = await client.query<PriceBookHours>(
    `SELECT code, name,
            labor_hours_low::float AS labor_hours_low,
            labor_hours_typical::float AS labor_hours_typical,
            labor_hours_high::float AS labor_hours_high
     FROM price_book WHERE is_active = true ORDER BY code`,
  );
  const { rows: pace } = await client.query<{ sqft_per_day: number; tall_pct: number | null }>(
    `SELECT r.base_rate::float AS sqft_per_day, m.modifier_pct::float AS tall_pct
     FROM production_rates r
     LEFT JOIN production_rate_modifiers m
       ON m.service_code = r.service_code AND m.complexity_factor_key = 'vaulted_ceilings'
     WHERE r.service_code = '5012' AND r.scope_component_key = 'wall_sqft' AND r.rate_unit = 'sqft_per_day'`,
  );
  return {
    priceBook,
    wallPaintRate: pace[0] ? { sqft_per_day: pace[0].sqft_per_day, tall_wall_modifier_pct: pace[0].tall_pct ?? 0 } : null,
  };
}
