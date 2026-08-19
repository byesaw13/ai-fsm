/**
 * When a fuel receipt is saved, stamp the open truck and write a fuel log.
 * TASK-113. Money stays on expenses; gallons live on vehicle_fuel_logs.
 */
import type { PoolClient } from "pg";
import { coerceGallons, isFuelExpenseCategory } from "./fuel-from-receipt";

export type AttachFuelExpenseInput = {
  accountId: string;
  userId: string;
  expenseId: string;
  category: string;
  expenseDate: string;
  notes?: string | null;
  gallons?: number | null;
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

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM vehicle_fuel_logs
      WHERE expense_id = $1 AND account_id = $2
      LIMIT 1`,
    [input.expenseId, input.accountId],
  );

  const gallons = coerceGallons(input.gallons);
  if (existing.rows[0]) {
    const filledAt = /^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)
      ? `${input.expenseDate}T12:00:00.000Z`
      : null;
    await client.query(
      `UPDATE vehicle_fuel_logs
          SET vehicle_id = $1,
              gallons = COALESCE($2, gallons),
              notes = COALESCE($3, notes),
              filled_at = COALESCE($4::timestamptz, filled_at),
              updated_at = now()
        WHERE id = $5 AND account_id = $6`,
      [
        vehicle.id,
        gallons,
        input.notes ?? null,
        filledAt,
        existing.rows[0].id,
        input.accountId,
      ],
    );
    return { vehicleId: vehicle.id, fuelLogId: existing.rows[0].id, attached: true };
  }

  if (gallons == null) {
    return { vehicleId: vehicle.id, fuelLogId: null, attached: true };
  }

  const filledAt = /^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)
    ? `${input.expenseDate}T12:00:00.000Z`
    : new Date().toISOString();

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO vehicle_fuel_logs (
       account_id, vehicle_id, filled_at, odometer, gallons, is_full_tank,
       odometer_suspect, notes, expense_id, created_by
     ) VALUES ($1, $2, $3::timestamptz, NULL, $4, true, false, $5, $6, $7)
     RETURNING id`,
    [
      input.accountId,
      vehicle.id,
      filledAt,
      gallons,
      input.notes ?? null,
      input.expenseId,
      input.userId,
    ],
  );

  return { vehicleId: vehicle.id, fuelLogId: inserted.rows[0].id, attached: true };
}
