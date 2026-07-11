import type { PoolClient } from "pg";
import {
  DEFAULT_TRAVEL_SETTINGS,
  type TravelSettings,
  type TravelTimeRateMode,
  type TravelTimeRounding,
  type TripCalculationMethod,
  type TripDirectionMode,
} from "@ai-fsm/domain";

export interface TravelSettingsRow extends TravelSettings {
  account_id: string;
}

function num(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function rowToTravelSettings(row: Record<string, unknown> | null | undefined): TravelSettings {
  if (!row) return { ...DEFAULT_TRAVEL_SETTINGS };
  return {
    origin_address: String(row.origin_address ?? DEFAULT_TRAVEL_SETTINGS.origin_address),
    origin_city: String(row.origin_city ?? DEFAULT_TRAVEL_SETTINGS.origin_city),
    origin_state: String(row.origin_state ?? DEFAULT_TRAVEL_SETTINGS.origin_state),
    origin_zip: String(row.origin_zip ?? DEFAULT_TRAVEL_SETTINGS.origin_zip),
    origin_latitude:
      row.origin_latitude != null ? Number(row.origin_latitude) : DEFAULT_TRAVEL_SETTINGS.origin_latitude,
    origin_longitude:
      row.origin_longitude != null ? Number(row.origin_longitude) : DEFAULT_TRAVEL_SETTINGS.origin_longitude,
    included_one_way_miles: num(row.included_one_way_miles, DEFAULT_TRAVEL_SETTINGS.included_one_way_miles),
    mileage_only_cutoff_miles: num(row.mileage_only_cutoff_miles, DEFAULT_TRAVEL_SETTINGS.mileage_only_cutoff_miles),
    travel_time_cutoff_miles: num(row.travel_time_cutoff_miles, DEFAULT_TRAVEL_SETTINGS.travel_time_cutoff_miles),
    long_distance_review_miles: num(row.long_distance_review_miles, DEFAULT_TRAVEL_SETTINGS.long_distance_review_miles),
    minimum_project_value_low_cents: num(
      row.minimum_project_value_low_cents,
      DEFAULT_TRAVEL_SETTINGS.minimum_project_value_low_cents
    ),
    minimum_project_value_high_cents: num(
      row.minimum_project_value_high_cents,
      DEFAULT_TRAVEL_SETTINGS.minimum_project_value_high_cents
    ),
    default_mileage_rate_cents: num(row.default_mileage_rate_cents, DEFAULT_TRAVEL_SETTINGS.default_mileage_rate_cents),
    default_travel_time_rate_cents: num(
      row.default_travel_time_rate_cents,
      DEFAULT_TRAVEL_SETTINGS.default_travel_time_rate_cents
    ),
    travel_time_rate_mode: (row.travel_time_rate_mode as TravelTimeRateMode) ??
      DEFAULT_TRAVEL_SETTINGS.travel_time_rate_mode,
    travel_time_rounding: (row.travel_time_rounding as TravelTimeRounding) ??
      DEFAULT_TRAVEL_SETTINGS.travel_time_rounding,
    default_trip_calculation_method: (row.default_trip_calculation_method as TripCalculationMethod) ??
      DEFAULT_TRAVEL_SETTINGS.default_trip_calculation_method,
    default_trip_direction: (row.default_trip_direction as TripDirectionMode) ??
      DEFAULT_TRAVEL_SETTINGS.default_trip_direction,
    customer_facing_line_title: String(
      row.customer_facing_line_title ?? DEFAULT_TRAVEL_SETTINGS.customer_facing_line_title
    ),
    customer_facing_description: String(
      row.customer_facing_description ?? DEFAULT_TRAVEL_SETTINGS.customer_facing_description
    ),
    show_formulas_to_customer: Boolean(
      row.show_formulas_to_customer ?? DEFAULT_TRAVEL_SETTINGS.show_formulas_to_customer
    ),
    high_travel_ratio_threshold: num(
      row.high_travel_ratio_threshold,
      DEFAULT_TRAVEL_SETTINGS.high_travel_ratio_threshold
    ),
  };
}

/** Load settings; auto-seed row if missing (new accounts). */
export async function loadTravelSettings(
  client: PoolClient,
  accountId: string
): Promise<TravelSettings> {
  const existing = await client.query(
    `SELECT * FROM business_travel_settings WHERE account_id = $1`,
    [accountId]
  );
  if ((existing.rowCount ?? 0) > 0) {
    return rowToTravelSettings(existing.rows[0] as Record<string, unknown>);
  }

  await client.query(
    `INSERT INTO business_travel_settings (account_id) VALUES ($1)
     ON CONFLICT (account_id) DO NOTHING`,
    [accountId]
  );
  const seeded = await client.query(
    `SELECT * FROM business_travel_settings WHERE account_id = $1`,
    [accountId]
  );
  return rowToTravelSettings(seeded.rows[0] as Record<string, unknown> | undefined);
}

export interface ActiveMileageRate {
  id: string | null;
  rate_cents: number;
  effective_date: string | null;
  source: string | null;
  description: string | null;
}

/** Active mileage rate for new calculations. Falls back to settings default. */
export async function loadActiveMileageRate(
  client: PoolClient,
  accountId: string,
  settings?: TravelSettings
): Promise<ActiveMileageRate> {
  const r = await client.query<{
    id: string;
    rate_cents: number;
    effective_date: string;
    source: string;
    description: string | null;
  }>(
    `SELECT id, rate_cents, effective_date::text, source, description
     FROM mileage_rates
     WHERE account_id = $1 AND is_active = true
     ORDER BY effective_date DESC, created_at DESC
     LIMIT 1`,
    [accountId]
  );
  if ((r.rowCount ?? 0) > 0) {
    const row = r.rows[0];
    return {
      id: row.id,
      rate_cents: row.rate_cents,
      effective_date: row.effective_date,
      source: row.source,
      description: row.description,
    };
  }

  const s = settings ?? (await loadTravelSettings(client, accountId));
  return {
    id: null,
    rate_cents: s.default_mileage_rate_cents,
    effective_date: null,
    source: "business",
    description: "Settings default",
  };
}

export function resolveTravelTimeRateCents(settings: TravelSettings): number {
  if (settings.travel_time_rate_mode === "none") return 0;
  return settings.default_travel_time_rate_cents;
}
