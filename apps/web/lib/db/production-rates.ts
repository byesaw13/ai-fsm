import type { PoolClient } from "pg";

/** A production rate as the Settings page shows it (TASK-193). */
export interface ProductionRateRow {
  id: string;
  service_code: string;
  service_name: string | null;
  scope_component_key: string;
  base_rate: number;
  rate_unit: string;
  notes: string | null;
  calibrated: boolean;
  calibrated_at: string | null;
  modifiers: ProductionRateModifierRow[];
}

export interface ProductionRateModifierRow {
  id: string;
  complexity_factor_key: string;
  modifier_pct: number;
  notes: string | null;
  calibrated: boolean;
  calibrated_at: string | null;
}

/** Every rate with its modifiers, by service code. Rates are shared, not per account. */
export async function listProductionRates(client: PoolClient): Promise<ProductionRateRow[]> {
  const { rows: rates } = await client.query<Omit<ProductionRateRow, "modifiers">>(
    `SELECT r.id, r.service_code, pb.name AS service_name, r.scope_component_key,
            r.base_rate::float AS base_rate, r.rate_unit, r.notes, r.calibrated, r.calibrated_at::text
     FROM production_rates r
     LEFT JOIN LATERAL (SELECT name FROM price_book WHERE code = r.service_code LIMIT 1) pb ON true
     ORDER BY r.service_code, r.scope_component_key`,
  );
  const { rows: mods } = await client.query<ProductionRateModifierRow & { service_code: string }>(
    `SELECT id, service_code, complexity_factor_key, modifier_pct::float AS modifier_pct, notes, calibrated, calibrated_at::text
     FROM production_rate_modifiers
     ORDER BY service_code, complexity_factor_key`,
  );
  return rates.map((r) => ({
    ...r,
    modifiers: mods.filter((m) => m.service_code === r.service_code).map(({ service_code: _code, ...m }) => m),
  }));
}

/** Change a rate's value or calibration. Calibrating stamps the time; uncalibrating clears it. */
export async function updateProductionRate(
  client: PoolClient,
  id: string,
  patch: { base_rate?: number; calibrated?: boolean },
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> } | null> {
  const { rows } = await client.query(
    `SELECT base_rate::float AS base_rate, calibrated FROM production_rates WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) return null;
  const { rows: after } = await client.query(
    `UPDATE production_rates
     SET base_rate = COALESCE($2, base_rate),
         calibrated = COALESCE($3, calibrated),
         calibrated_at = CASE WHEN $3::boolean IS NULL THEN calibrated_at WHEN $3 THEN now() ELSE NULL END
     WHERE id = $1
     RETURNING base_rate::float AS base_rate, calibrated, calibrated_at::text`,
    [id, patch.base_rate ?? null, patch.calibrated ?? null],
  );
  return { before: rows[0], after: after[0] };
}

/** Change a modifier's percentage or calibration, the same way as a rate. */
export async function updateProductionRateModifier(
  client: PoolClient,
  id: string,
  patch: { modifier_pct?: number; calibrated?: boolean },
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> } | null> {
  const { rows } = await client.query(
    `SELECT modifier_pct::float AS modifier_pct, calibrated FROM production_rate_modifiers WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) return null;
  const { rows: after } = await client.query(
    `UPDATE production_rate_modifiers
     SET modifier_pct = COALESCE($2, modifier_pct),
         calibrated = COALESCE($3, calibrated),
         calibrated_at = CASE WHEN $3::boolean IS NULL THEN calibrated_at WHEN $3 THEN now() ELSE NULL END
     WHERE id = $1
     RETURNING modifier_pct::float AS modifier_pct, calibrated, calibrated_at::text`,
    [id, patch.modifier_pct ?? null, patch.calibrated ?? null],
  );
  return { before: rows[0], after: after[0] };
}
