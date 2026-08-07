/**
 * Atomic vehicle capture + expense create (TASK-093).
 * Record tables hold facts; money lives only on expenses.
 */
import type { PoolClient } from "pg";
import { shouldFlagSuspectOdometer } from "@ai-fsm/domain";

export async function lastKnownOdometer(
  client: PoolClient,
  accountId: string,
  vehicleId: string,
): Promise<number | null> {
  const { rows } = await client.query<{ odo: number | null }>(
    `SELECT GREATEST(
       (SELECT MAX(end_odometer) FROM vehicle_sessions
         WHERE account_id = $1 AND vehicle_id = $2 AND end_odometer IS NOT NULL),
       (SELECT MAX(odometer) FROM vehicle_fuel_logs
         WHERE account_id = $1 AND vehicle_id = $2 AND odometer IS NOT NULL AND odometer_suspect = false),
       (SELECT MAX(odometer) FROM vehicle_service_records
         WHERE account_id = $1 AND vehicle_id = $2 AND odometer IS NOT NULL AND odometer_suspect = false)
     )::int AS odo`,
    [accountId, vehicleId],
  );
  return rows[0]?.odo ?? null;
}

export async function assertVehicleInAccount(
  client: PoolClient,
  accountId: string,
  vehicleId: string,
): Promise<{ id: string; kind: string; nickname: string } | null> {
  const { rows } = await client.query<{ id: string; kind: string; nickname: string }>(
    `SELECT id, kind, nickname FROM vehicles
     WHERE id = $1 AND account_id = $2 AND is_active = true`,
    [vehicleId, accountId],
  );
  return rows[0] ?? null;
}

export async function insertVehicleExpense(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    vehicleId: string;
    category: "vehicle_fuel" | "vehicle_maintenance" | "vehicle_registration" | "vehicle_insurance" | "vehicle_loan_payment";
    amountCents: number;
    expenseDate: string;
    vendorName: string;
    notes?: string | null;
  },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO expenses (
       account_id, vendor_name, category, amount_cents, expense_date,
       notes, created_by, vehicle_id
     ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)
     RETURNING id`,
    [
      opts.accountId,
      opts.vendorName,
      opts.category,
      opts.amountCents,
      opts.expenseDate,
      opts.notes ?? null,
      opts.userId,
      opts.vehicleId,
    ],
  );
  return rows[0].id;
}

export async function createFuelLogWithExpense(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    vehicleId: string;
    filledAt?: string;
    odometer: number | null;
    gallons: number;
    isFullTank: boolean;
    amountCents: number;
    vendorName?: string;
    notes?: string | null;
  },
): Promise<{ fuelLogId: string; expenseId: string; odometerSuspect: boolean }> {
  const vehicle = await assertVehicleInAccount(client, opts.accountId, opts.vehicleId);
  if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");
  if (vehicle.kind === "trailer") throw new Error("TRAILER_NO_FUEL");

  const lastOdo = await lastKnownOdometer(client, opts.accountId, opts.vehicleId);
  const odometerSuspect = shouldFlagSuspectOdometer(opts.odometer, lastOdo);
  const filledAt = opts.filledAt ?? new Date().toISOString();
  const expenseDate = filledAt.slice(0, 10);

  const expenseId = await insertVehicleExpense(client, {
    accountId: opts.accountId,
    userId: opts.userId,
    vehicleId: opts.vehicleId,
    category: "vehicle_fuel",
    amountCents: opts.amountCents,
    expenseDate,
    vendorName: opts.vendorName?.trim() || "Fuel",
    notes: opts.notes ?? `Fuel ${opts.gallons} gal · ${vehicle.nickname}`,
  });

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO vehicle_fuel_logs (
       account_id, vehicle_id, filled_at, odometer, gallons, is_full_tank,
       odometer_suspect, notes, expense_id, created_by
     ) VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      opts.accountId,
      opts.vehicleId,
      filledAt,
      opts.odometer,
      opts.gallons,
      opts.isFullTank,
      odometerSuspect,
      opts.notes ?? null,
      expenseId,
      opts.userId,
    ],
  );

  return { fuelLogId: rows[0].id, expenseId, odometerSuspect };
}

export async function createServiceRecordWithExpense(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    vehicleId: string;
    servicedAt: string;
    odometer: number | null;
    serviceTypes: string[];
    amountCents: number;
    vendorName?: string | null;
    notes?: string | null;
  },
): Promise<{ serviceRecordId: string; expenseId: string; odometerSuspect: boolean }> {
  const vehicle = await assertVehicleInAccount(client, opts.accountId, opts.vehicleId);
  if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");
  if (!opts.serviceTypes.length) throw new Error("SERVICE_TYPES_REQUIRED");

  const lastOdo = await lastKnownOdometer(client, opts.accountId, opts.vehicleId);
  const odometerSuspect = shouldFlagSuspectOdometer(opts.odometer, lastOdo);

  const expenseId = await insertVehicleExpense(client, {
    accountId: opts.accountId,
    userId: opts.userId,
    vehicleId: opts.vehicleId,
    category: "vehicle_maintenance",
    amountCents: opts.amountCents,
    expenseDate: opts.servicedAt.slice(0, 10),
    vendorName: opts.vendorName?.trim() || "Service",
    notes: opts.notes ?? `${opts.serviceTypes.join(", ")} · ${vehicle.nickname}`,
  });

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO vehicle_service_records (
       account_id, vehicle_id, serviced_at, odometer, odometer_suspect,
       service_types, vendor_name, notes, expense_id, created_by
     ) VALUES ($1, $2, $3::date, $4, $5, $6::text[], $7, $8, $9, $10)
     RETURNING id`,
    [
      opts.accountId,
      opts.vehicleId,
      opts.servicedAt.slice(0, 10),
      opts.odometer,
      odometerSuspect,
      opts.serviceTypes,
      opts.vendorName ?? null,
      opts.notes ?? null,
      expenseId,
      opts.userId,
    ],
  );

  return { serviceRecordId: rows[0].id, expenseId, odometerSuspect };
}
