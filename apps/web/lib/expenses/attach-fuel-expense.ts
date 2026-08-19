/**
 * When a fuel receipt is saved, stamp the open truck and write a fuel log.
 * TASK-113. Money stays on expenses; gallons live on vehicle_fuel_logs.
 */
import type { PoolClient } from "pg";
import {
  coerceGallons,
  gallonsFromParsedReceipt,
  isFuelExpenseCategory,
  odometerOutOfHistory,
  pickOdometerForFuelDay,
  reviewFuelReceipt,
} from "./fuel-from-receipt";

export type AttachFuelExpenseInput = {
  accountId: string;
  userId: string;
  expenseId: string;
  category: string;
  expenseDate: string;
  notes?: string | null;
  gallons?: number | null;
  amountCents?: number | null;
  odometer?: number | null;
  vehicleId?: string | null;
};

export type AttachFuelExpenseResult = {
  vehicleId: string | null;
  fuelLogId: string | null;
  attached: boolean;
};

export async function resolveLoggedInVehicle(
  client: PoolClient,
  accountId: string,
  userId: string,
  explicitVehicleId?: string | null,
): Promise<{ id: string; nickname: string } | null> {
  if (explicitVehicleId) {
    const explicit = await client.query<{ id: string; nickname: string }>(
      `SELECT id, nickname FROM vehicles
        WHERE id = $1 AND account_id = $2
          AND is_active = true AND kind <> 'trailer'`,
      [explicitVehicleId, accountId],
    );
    if (explicit.rows[0]) return explicit.rows[0];
  }

  const open = await client.query<{ id: string; nickname: string }>(
    `SELECT v.id, v.nickname
       FROM vehicle_sessions s
       JOIN vehicles v ON v.id = s.vehicle_id AND v.account_id = s.account_id
      WHERE s.account_id = $1
        AND s.created_by = $2
        AND s.status = 'open'
        AND s.end_odometer IS NULL
        AND s.miles IS NULL
        AND v.is_active = true
        AND v.kind <> 'trailer'
      ORDER BY s.started_at DESC NULLS LAST
      LIMIT 1`,
    [accountId, userId],
  );
  if (open.rows[0]) return open.rows[0];

  const defaulted = await client.query<{ id: string; nickname: string }>(
    `SELECT id, nickname FROM vehicles
      WHERE account_id = $1 AND is_active = true AND kind <> 'trailer' AND is_default = true
      LIMIT 1`,
    [accountId],
  );
  if (defaulted.rows[0]) return defaulted.rows[0];

  const only = await client.query<{ id: string; nickname: string }>(
    `SELECT id, nickname FROM vehicles
      WHERE account_id = $1 AND is_active = true AND kind <> 'trailer'
      ORDER BY nickname ASC
      LIMIT 2`,
    [accountId],
  );
  return only.rows.length === 1 ? only.rows[0] : null;
}

export async function odometerForFuelDate(
  client: PoolClient,
  accountId: string,
  vehicleId: string,
  expenseDate: string,
): Promise<{ odometer: number; source: "same_day_start" | "previous_day_end" } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return null;

  const sameDay = await client.query<{ start_odometer: number | null }>(
    `SELECT start_odometer FROM vehicle_sessions
      WHERE account_id = $1 AND vehicle_id = $2
        AND session_date = $3::date
        AND start_odometer IS NOT NULL
      ORDER BY started_at ASC NULLS LAST
      LIMIT 1`,
    [accountId, vehicleId, expenseDate],
  );
  const previous = await client.query<{ end_odometer: number | null }>(
    `SELECT end_odometer FROM vehicle_sessions
      WHERE account_id = $1 AND vehicle_id = $2
        AND session_date < $3::date
        AND end_odometer IS NOT NULL
      ORDER BY session_date DESC, started_at DESC NULLS LAST
      LIMIT 1`,
    [accountId, vehicleId, expenseDate],
  );
  return pickOdometerForFuelDay({
    sameDayStart: sameDay.rows[0]?.start_odometer ?? null,
    previousDayEnd: previous.rows[0]?.end_odometer ?? null,
  });
}

async function odometerSuspectForFill(
  client: PoolClient,
  accountId: string,
  vehicleId: string,
  filledAt: string,
  odometer: number,
  excludeExpenseId: string,
): Promise<boolean> {
  const prior = await client.query<{ odo: number | null }>(
    `SELECT MAX(odometer) AS odo FROM vehicle_fuel_logs
      WHERE account_id = $1 AND vehicle_id = $2
        AND filled_at < $3::timestamptz
        AND odometer IS NOT NULL AND odometer_suspect = false
        AND expense_id IS DISTINCT FROM $4`,
    [accountId, vehicleId, filledAt, excludeExpenseId],
  );
  const next = await client.query<{ odo: number | null }>(
    `SELECT MIN(odometer) AS odo FROM vehicle_fuel_logs
      WHERE account_id = $1 AND vehicle_id = $2
        AND filled_at > $3::timestamptz
        AND odometer IS NOT NULL AND odometer_suspect = false
        AND expense_id IS DISTINCT FROM $4`,
    [accountId, vehicleId, filledAt, excludeExpenseId],
  );
  return odometerOutOfHistory({
    odometer,
    priorOdometer: prior.rows[0]?.odo ?? null,
    nextOdometer: next.rows[0]?.odo ?? null,
  });
}

export async function attachFuelExpenseToVehicle(
  client: PoolClient,
  input: AttachFuelExpenseInput,
): Promise<AttachFuelExpenseResult> {
  if (!isFuelExpenseCategory(input.category)) {
    return { vehicleId: null, fuelLogId: null, attached: false };
  }

  const vehicle = await resolveLoggedInVehicle(
    client,
    input.accountId,
    input.userId,
    input.vehicleId,
  );
  if (!vehicle) {
    return { vehicleId: null, fuelLogId: null, attached: false };
  }

  await client.query(
    `UPDATE expenses
        SET vehicle_id = $1, updated_at = now()
      WHERE id = $2 AND account_id = $3 AND vehicle_id IS DISTINCT FROM $1`,
    [vehicle.id, input.expenseId, input.accountId],
  );

  const existing = await client.query<{ id: string; odometer: number | null }>(
    `SELECT id, odometer FROM vehicle_fuel_logs
      WHERE expense_id = $1 AND account_id = $2
      LIMIT 1`,
    [input.expenseId, input.accountId],
  );

  let gallons = gallonsFromParsedReceipt({
    category: input.category,
    gallons: input.gallons,
    notes: input.notes,
    amountCents: input.amountCents ?? null,
  });
  const review = reviewFuelReceipt({
    gallons,
    amountCents: input.amountCents ?? null,
    notes: input.notes,
  });
  if (review.gallonsLooksLikePrice && review.impliedGallons != null) {
    gallons = review.impliedGallons;
  }
  gallons = coerceGallons(gallons);

  const filledAt = /^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)
    ? `${input.expenseDate}T12:00:00.000Z`
    : new Date().toISOString();

  const explicitOdo =
    input.odometer != null && input.odometer > 0 ? Math.round(input.odometer) : null;
  const autoOdo =
    explicitOdo == null
      ? await odometerForFuelDate(client, input.accountId, vehicle.id, input.expenseDate)
      : null;
  const odometer =
    explicitOdo ?? existing.rows[0]?.odometer ?? autoOdo?.odometer ?? null;
  const odometerSuspect =
    odometer != null
      ? await odometerSuspectForFill(
          client,
          input.accountId,
          vehicle.id,
          filledAt,
          odometer,
          input.expenseId,
        )
      : false;

  if (existing.rows[0]) {
    await client.query(
      `UPDATE vehicle_fuel_logs
          SET vehicle_id = $1,
              gallons = COALESCE($2, gallons),
              notes = COALESCE($3, notes),
              filled_at = COALESCE($4::timestamptz, filled_at),
              odometer = $5,
              odometer_suspect = $6,
              updated_at = now()
        WHERE id = $7 AND account_id = $8`,
      [
        vehicle.id,
        gallons,
        input.notes ?? null,
        filledAt,
        odometer,
        odometerSuspect,
        existing.rows[0].id,
        input.accountId,
      ],
    );
    return { vehicleId: vehicle.id, fuelLogId: existing.rows[0].id, attached: true };
  }

  if (gallons == null) {
    return { vehicleId: vehicle.id, fuelLogId: null, attached: true };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO vehicle_fuel_logs (
       account_id, vehicle_id, filled_at, odometer, gallons, is_full_tank,
       odometer_suspect, notes, expense_id, created_by
     ) VALUES ($1, $2, $3::timestamptz, $4, $5, true, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.accountId,
      vehicle.id,
      filledAt,
      odometer,
      gallons,
      odometerSuspect,
      input.notes ?? null,
      input.expenseId,
      input.userId,
    ],
  );

  return { vehicleId: vehicle.id, fuelLogId: inserted.rows[0].id, attached: true };
}
