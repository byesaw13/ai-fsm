import type { PoolClient } from "pg";
import {
  calculateTravelCharges,
  formatOriginAddress,
  resolveTripCount,
  type ClientTravelOverrides,
  type TravelCalculationResult,
  type TravelChargeMode,
  type TripCalculationMethod,
  type TripDirectionMode,
  type TravelCalculationSource,
} from "@ai-fsm/domain";
import {
  loadActiveMileageRate,
  loadTravelSettings,
  resolveTravelTimeRateCents,
} from "./settings";
import { buildFullAddress, lookupOneWayDistance } from "./distance";

export interface ClientTravelRow {
  relationship_type: string;
  travel_rule: string;
  custom_included_one_way_miles: number | null;
  custom_mileage_rate_cents: number | null;
  custom_travel_time_rate_cents: number | null;
  minimum_project_value_exempt: boolean;
}

export interface CalculateTravelRequest {
  property_id?: string | null;
  destination_address?: string | null;
  client_id?: string | null;
  project_value_cents?: number | null;
  trip_count?: number | null;
  trip_direction?: TripDirectionMode | null;
  trip_calculation_method?: TripCalculationMethod | null;
  planned_visits?: number | null;
  planned_workdays?: number | null;
  charge_mode?: TravelChargeMode | null;
  custom_total_cents?: number | null;
  manual_one_way_miles?: number | null;
  manual_one_way_minutes?: number | null;
}

export interface CalculateTravelResponse {
  calculation: TravelCalculationResult;
  origin_address: string;
  destination_address: string;
  calculation_source: TravelCalculationSource;
  geocode_failed: boolean;
  distance_error?: string;
  mileage_rate_id: string | null;
  trip_calculation_method: TripCalculationMethod;
  settings_summary: {
    included_one_way_miles: number;
    travel_time_cutoff_miles: number;
    long_distance_review_miles: number;
    customer_facing_line_title: string;
    customer_facing_description: string;
  };
}

export async function calculateTravelForAccount(
  client: PoolClient,
  accountId: string,
  req: CalculateTravelRequest
): Promise<CalculateTravelResponse> {
  const settings = await loadTravelSettings(client, accountId);
  const mileage = await loadActiveMileageRate(client, accountId, settings);
  const travelTimeRate = resolveTravelTimeRateCents(settings);

  const originAddress = formatOriginAddress(settings);

  let destAddress = (req.destination_address ?? "").trim();
  let destCoords: { latitude: number; longitude: number } | null = null;

  if (req.property_id) {
    const prop = await client.query<{
      address: string;
      city: string | null;
      state: string | null;
      zip: string | null;
      latitude: number | null;
      longitude: number | null;
    }>(
      `SELECT address, city, state, zip, latitude, longitude
       FROM properties WHERE id = $1 AND account_id = $2`,
      [req.property_id, accountId]
    );
    if (prop.rowCount) {
      const p = prop.rows[0];
      if (!destAddress) {
        destAddress = buildFullAddress({
          address: p.address,
          city: p.city,
          state: p.state,
          zip: p.zip,
        });
      }
      if (p.latitude != null && p.longitude != null) {
        destCoords = { latitude: Number(p.latitude), longitude: Number(p.longitude) };
      }
    }
  }

  let clientOverrides: Partial<ClientTravelOverrides> | null = null;
  if (req.client_id) {
    const c = await client.query<ClientTravelRow>(
      `SELECT relationship_type, travel_rule,
              custom_included_one_way_miles, custom_mileage_rate_cents,
              custom_travel_time_rate_cents, minimum_project_value_exempt
       FROM clients WHERE id = $1 AND account_id = $2`,
      [req.client_id, accountId]
    );
    if (c.rowCount) {
      const row = c.rows[0];
      clientOverrides = {
        relationship_type: row.relationship_type as ClientTravelOverrides["relationship_type"],
        travel_rule: row.travel_rule as ClientTravelOverrides["travel_rule"],
        custom_included_one_way_miles:
          row.custom_included_one_way_miles != null
            ? Number(row.custom_included_one_way_miles)
            : null,
        custom_mileage_rate_cents: row.custom_mileage_rate_cents,
        custom_travel_time_rate_cents: row.custom_travel_time_rate_cents,
        minimum_project_value_exempt: row.minimum_project_value_exempt,
      };
    }
  }

  const originCoords =
    settings.origin_latitude != null && settings.origin_longitude != null
      ? { latitude: settings.origin_latitude, longitude: settings.origin_longitude }
      : null;

  const distance = await lookupOneWayDistance({
    origin_address: originAddress,
    destination_address: destAddress || originAddress,
    origin_coords: originCoords,
    destination_coords: destCoords,
    manual_one_way_miles: req.manual_one_way_miles,
    manual_one_way_minutes: req.manual_one_way_minutes,
  });

  const method: TripCalculationMethod =
    req.trip_calculation_method ?? settings.default_trip_calculation_method;
  const tripCount = resolveTripCount({
    method,
    planned_visits: req.planned_visits,
    planned_workdays: req.planned_workdays,
    custom_trip_count: req.trip_count,
  });
  const direction: TripDirectionMode =
    req.trip_direction ?? settings.default_trip_direction;

  const calculation = calculateTravelCharges({
    one_way_miles: distance.one_way_miles,
    one_way_minutes: distance.one_way_minutes,
    trip_count: tripCount,
    trip_direction: direction,
    settings,
    mileage_rate_cents: mileage.rate_cents,
    travel_time_rate_cents: travelTimeRate,
    client: clientOverrides,
    project_value_cents: req.project_value_cents,
    charge_mode: req.charge_mode ?? "separate_line",
    custom_total_cents: req.custom_total_cents,
  });

  // Surface geocode failure as a warning on the result
  if (distance.geocode_failed) {
    calculation.warnings.unshift({
      code: "geocode_failed",
      message:
        distance.error ??
        "Address could not be geocoded. Enter mileage and drive time manually.",
      severity: "warning",
    });
  }

  return {
    calculation,
    origin_address: originAddress,
    destination_address: destAddress || "(no destination)",
    calculation_source: distance.source,
    geocode_failed: distance.geocode_failed,
    distance_error: distance.error,
    mileage_rate_id: mileage.id,
    trip_calculation_method: method,
    settings_summary: {
      included_one_way_miles: settings.included_one_way_miles,
      travel_time_cutoff_miles: settings.travel_time_cutoff_miles,
      long_distance_review_miles: settings.long_distance_review_miles,
      customer_facing_line_title: settings.customer_facing_line_title,
      customer_facing_description: settings.customer_facing_description,
    },
  };
}
