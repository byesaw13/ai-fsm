import { describe, it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
import { createFuelLogWithExpense, createServiceRecordWithExpense } from "../capture";

const ACCOUNT_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_ID = "00000000-0000-0000-0000-0000000000u1";
const VEHICLE_ID = "00000000-0000-0000-0000-0000000000v1";
const EXPENSE_ID = "00000000-0000-0000-0000-0000000000e1";
const FUEL_LOG_ID = "00000000-0000-0000-0000-0000000000f1";
const SERVICE_ID = "00000000-0000-0000-0000-0000000000s1";

type QueryCall = { sql: string; params: unknown[] };

/**
 * PoolClient mock: routes by SQL substring. Records every call for order/field asserts.
 */
function makeClient(handlers: {
  vehicle?: { id: string; kind: string; nickname: string } | null;
  lastOdo?: number | null;
  expenseId?: string;
  fuelLogId?: string;
  serviceRecordId?: string;
}): { client: PoolClient; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const client = {
    query: vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM vehicles")) {
        const row = handlers.vehicle === undefined
          ? { id: VEHICLE_ID, kind: "truck", nickname: "Ram" }
          : handlers.vehicle;
        return Promise.resolve({ rows: row ? [row] : [], rowCount: row ? 1 : 0 });
      }
      if (sql.includes("GREATEST") || sql.includes("vehicle_sessions") && sql.includes("MAX(end_odometer)")) {
        const odo = handlers.lastOdo === undefined ? null : handlers.lastOdo;
        return Promise.resolve({ rows: [{ odo }], rowCount: 1 });
      }
      if (sql.includes("INSERT INTO expenses")) {
        return Promise.resolve({
          rows: [{ id: handlers.expenseId ?? EXPENSE_ID }],
          rowCount: 1,
        });
      }
      if (sql.includes("INSERT INTO vehicle_fuel_logs")) {
        return Promise.resolve({
          rows: [{ id: handlers.fuelLogId ?? FUEL_LOG_ID }],
          rowCount: 1,
        });
      }
      if (sql.includes("INSERT INTO vehicle_service_records")) {
        return Promise.resolve({
          rows: [{ id: handlers.serviceRecordId ?? SERVICE_ID }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
  } as unknown as PoolClient;
  return { client, calls };
}

function callIndex(calls: QueryCall[], substring: string): number {
  return calls.findIndex((c) => c.sql.includes(substring));
}

describe("createFuelLogWithExpense", () => {
  it("creates expense then fuel log with linked fields", async () => {
    const { client, calls } = makeClient({
      vehicle: { id: VEHICLE_ID, kind: "truck", nickname: "Ram" },
      lastOdo: 10000,
      expenseId: EXPENSE_ID,
      fuelLogId: FUEL_LOG_ID,
    });

    const result = await createFuelLogWithExpense(client, {
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      filledAt: "2026-03-15T14:30:00.000Z",
      odometer: 10200,
      gallons: 12.5,
      isFullTank: true,
      amountCents: 4500,
      vendorName: "Shell",
      notes: "highway fill",
    });

    expect(result).toEqual({
      fuelLogId: FUEL_LOG_ID,
      expenseId: EXPENSE_ID,
      odometerSuspect: false,
    });

    const expenseIdx = callIndex(calls, "INSERT INTO expenses");
    const fuelIdx = callIndex(calls, "INSERT INTO vehicle_fuel_logs");
    expect(expenseIdx).toBeGreaterThanOrEqual(0);
    expect(fuelIdx).toBeGreaterThanOrEqual(0);
    expect(expenseIdx).toBeLessThan(fuelIdx);

    const expenseCall = calls[expenseIdx];
    // account_id, vendor, category, amount, date, notes, created_by, vehicle_id
    expect(expenseCall.params[0]).toBe(ACCOUNT_ID);
    expect(expenseCall.params[1]).toBe("Shell");
    expect(expenseCall.params[2]).toBe("vehicle_fuel");
    expect(expenseCall.params[3]).toBe(4500);
    expect(expenseCall.params[4]).toBe("2026-03-15");
    expect(expenseCall.params[5]).toBe("highway fill");
    expect(expenseCall.params[6]).toBe(USER_ID);
    expect(expenseCall.params[7]).toBe(VEHICLE_ID);

    const fuelCall = calls[fuelIdx];
    // account, vehicle, filled_at, odometer, gallons, is_full_tank, odometer_suspect, notes, expense_id, created_by
    expect(fuelCall.params[0]).toBe(ACCOUNT_ID);
    expect(fuelCall.params[1]).toBe(VEHICLE_ID);
    expect(fuelCall.params[2]).toBe("2026-03-15T14:30:00.000Z");
    expect(fuelCall.params[3]).toBe(10200);
    expect(fuelCall.params[4]).toBe(12.5);
    expect(fuelCall.params[5]).toBe(true);
    expect(fuelCall.params[6]).toBe(false);
    expect(fuelCall.params[7]).toBe("highway fill");
    expect(fuelCall.params[8]).toBe(EXPENSE_ID);
    expect(fuelCall.params[9]).toBe(USER_ID);
  });

  it("throws TRAILER_NO_FUEL for trailer vehicles", async () => {
    const { client, calls } = makeClient({
      vehicle: { id: VEHICLE_ID, kind: "trailer", nickname: "Dump" },
    });

    await expect(
      createFuelLogWithExpense(client, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        vehicleId: VEHICLE_ID,
        odometer: 0,
        gallons: 5,
        isFullTank: true,
        amountCents: 1000,
      }),
    ).rejects.toThrow("TRAILER_NO_FUEL");

    expect(callIndex(calls, "INSERT INTO expenses")).toBe(-1);
    expect(callIndex(calls, "INSERT INTO vehicle_fuel_logs")).toBe(-1);
  });

  it("soft-flags odometer when reading regresses vs last known", async () => {
    const { client, calls } = makeClient({
      vehicle: { id: VEHICLE_ID, kind: "van", nickname: "Transit" },
      lastOdo: 50000,
    });

    const result = await createFuelLogWithExpense(client, {
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      filledAt: "2026-04-01T12:00:00.000Z",
      odometer: 49000,
      gallons: 10,
      isFullTank: true,
      amountCents: 3200,
    });

    expect(result.odometerSuspect).toBe(true);

    const fuelIdx = callIndex(calls, "INSERT INTO vehicle_fuel_logs");
    expect(fuelIdx).toBeGreaterThanOrEqual(0);
    // odometer_suspect param
    expect(calls[fuelIdx].params[6]).toBe(true);
  });
});

describe("createServiceRecordWithExpense", () => {
  it("throws SERVICE_TYPES_REQUIRED when serviceTypes is empty", async () => {
    const { client, calls } = makeClient({
      vehicle: { id: VEHICLE_ID, kind: "truck", nickname: "Ram" },
    });

    await expect(
      createServiceRecordWithExpense(client, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        vehicleId: VEHICLE_ID,
        servicedAt: "2026-03-20",
        odometer: 11000,
        serviceTypes: [],
        amountCents: 8900,
      }),
    ).rejects.toThrow("SERVICE_TYPES_REQUIRED");

    expect(callIndex(calls, "INSERT INTO expenses")).toBe(-1);
    expect(callIndex(calls, "INSERT INTO vehicle_service_records")).toBe(-1);
  });

  it("creates expense then service record with types and link", async () => {
    const { client, calls } = makeClient({
      vehicle: { id: VEHICLE_ID, kind: "truck", nickname: "Ram" },
      lastOdo: 10000,
      expenseId: EXPENSE_ID,
      serviceRecordId: SERVICE_ID,
    });

    const result = await createServiceRecordWithExpense(client, {
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      servicedAt: "2026-03-20T09:00:00.000Z",
      odometer: 11200,
      serviceTypes: ["oil_change", "tires"],
      amountCents: 12500,
      vendorName: "Jiffy Lube",
      notes: "synthetic",
    });

    expect(result).toEqual({
      serviceRecordId: SERVICE_ID,
      expenseId: EXPENSE_ID,
      odometerSuspect: false,
    });

    const expenseIdx = callIndex(calls, "INSERT INTO expenses");
    const serviceIdx = callIndex(calls, "INSERT INTO vehicle_service_records");
    expect(expenseIdx).toBeLessThan(serviceIdx);

    const expenseCall = calls[expenseIdx];
    expect(expenseCall.params[2]).toBe("vehicle_maintenance");
    expect(expenseCall.params[3]).toBe(12500);
    expect(expenseCall.params[4]).toBe("2026-03-20");
    expect(expenseCall.params[7]).toBe(VEHICLE_ID);

    const serviceCall = calls[serviceIdx];
    // account, vehicle, serviced_at, odometer, odometer_suspect, service_types, vendor, notes, expense_id, created_by
    expect(serviceCall.params[0]).toBe(ACCOUNT_ID);
    expect(serviceCall.params[1]).toBe(VEHICLE_ID);
    expect(serviceCall.params[2]).toBe("2026-03-20");
    expect(serviceCall.params[3]).toBe(11200);
    expect(serviceCall.params[4]).toBe(false);
    expect(serviceCall.params[5]).toEqual(["oil_change", "tires"]);
    expect(serviceCall.params[6]).toBe("Jiffy Lube");
    expect(serviceCall.params[7]).toBe("synthetic");
    expect(serviceCall.params[8]).toBe(EXPENSE_ID);
    expect(serviceCall.params[9]).toBe(USER_ID);
  });

  it("soft-flags odometer on service when reading regresses", async () => {
    const { client, calls } = makeClient({
      vehicle: { id: VEHICLE_ID, kind: "truck", nickname: "Ram" },
      lastOdo: 20000,
    });

    const result = await createServiceRecordWithExpense(client, {
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      servicedAt: "2026-05-01",
      odometer: 15000,
      serviceTypes: ["brakes"],
      amountCents: 5000,
    });

    expect(result.odometerSuspect).toBe(true);
    const serviceIdx = callIndex(calls, "INSERT INTO vehicle_service_records");
    expect(calls[serviceIdx].params[4]).toBe(true);
  });
});
