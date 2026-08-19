import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { attachFuelExpenseToVehicle, resolveLoggedInVehicle } from "../attach-fuel-expense";

const ACCOUNT = "00000000-0000-0000-0000-0000000000a1";
const USER = "00000000-0000-0000-0000-0000000000u1";
const VEHICLE = "00000000-0000-0000-0000-0000000000v1";
const EXPENSE = "00000000-0000-0000-0000-0000000000e1";
const FUEL_LOG = "00000000-0000-0000-0000-0000000000f1";

type Handler = (sql: string, params: unknown[]) => { rows: unknown[]; rowCount: number } | null;

function clientFor(handlers: Handler[]): PoolClient {
  return {
    query: vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
      for (const handler of handlers) {
        const hit = handler(sql, params);
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
  } as unknown as PoolClient;
}

describe("resolveLoggedInVehicle", () => {
  it("prefers the open vehicle session", async () => {
    const client = clientFor([
      (sql) =>
        sql.includes("vehicle_sessions")
          ? { rows: [{ id: VEHICLE, nickname: "Ram" }], rowCount: 1 }
          : null,
    ]);
    await expect(resolveLoggedInVehicle(client, ACCOUNT, USER, null)).resolves.toEqual({
      id: VEHICLE,
      nickname: "Ram",
    });
  });

  it("uses an explicit truck before the session", async () => {
    const other = "00000000-0000-0000-0000-0000000000v2";
    const client = clientFor([
      (sql, params) =>
        sql.includes("FROM vehicles") && params[0] === other
          ? { rows: [{ id: other, nickname: "Van" }], rowCount: 1 }
          : null,
    ]);
    await expect(resolveLoggedInVehicle(client, ACCOUNT, USER, other)).resolves.toEqual({
      id: other,
      nickname: "Van",
    });
  });
});

describe("attachFuelExpenseToVehicle", () => {
  it("no-ops for non-fuel categories", async () => {
    const client = clientFor([]);
    const result = await attachFuelExpenseToVehicle(client, {
      accountId: ACCOUNT,
      userId: USER,
      expenseId: EXPENSE,
      category: "materials",
      expenseDate: "2026-08-18",
    });
    expect(result).toEqual({ vehicleId: null, fuelLogId: null, attached: false });
    expect(client.query).not.toHaveBeenCalled();
  });

  it("stamps the truck and writes a fuel log when gallons are known", async () => {
    const client = clientFor([
      (sql) =>
        sql.includes("vehicle_sessions")
          ? { rows: [{ id: VEHICLE, nickname: "Ram" }], rowCount: 1 }
          : null,
      (sql) => (sql.includes("UPDATE expenses") ? { rows: [], rowCount: 1 } : null),
      (sql) => (sql.includes("SELECT id FROM vehicle_fuel_logs") ? { rows: [], rowCount: 0 } : null),
      (sql) =>
        sql.includes("INSERT INTO vehicle_fuel_logs")
          ? { rows: [{ id: FUEL_LOG }], rowCount: 1 }
          : null,
    ]);

    const result = await attachFuelExpenseToVehicle(client, {
      accountId: ACCOUNT,
      userId: USER,
      expenseId: EXPENSE,
      category: "fuel",
      expenseDate: "2026-08-18",
      notes: "23.707 gallons",
      gallons: 23.707,
    });

    expect(result).toEqual({ vehicleId: VEHICLE, fuelLogId: FUEL_LOG, attached: true });
    const insert = (client.query as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO vehicle_fuel_logs"),
    );
    expect(insert?.[1]).toEqual([
      ACCOUNT,
      VEHICLE,
      "2026-08-18T12:00:00.000Z",
      23.707,
      "23.707 gallons",
      EXPENSE,
      USER,
    ]);
  });

  it("stamps the truck without a fuel log when gallons are missing", async () => {
    const client = clientFor([
      (sql) =>
        sql.includes("vehicle_sessions")
          ? { rows: [{ id: VEHICLE, nickname: "Ram" }], rowCount: 1 }
          : null,
      (sql) => (sql.includes("UPDATE expenses") ? { rows: [], rowCount: 1 } : null),
      (sql) => (sql.includes("SELECT id FROM vehicle_fuel_logs") ? { rows: [], rowCount: 0 } : null),
    ]);

    const result = await attachFuelExpenseToVehicle(client, {
      accountId: ACCOUNT,
      userId: USER,
      expenseId: EXPENSE,
      category: "fuel",
      expenseDate: "2026-08-18",
    });

    expect(result).toEqual({ vehicleId: VEHICLE, fuelLogId: null, attached: true });
    const insert = (client.query as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO vehicle_fuel_logs"),
    );
    expect(insert).toBeUndefined();
  });

  it("does not duplicate an existing fuel log for the same expense", async () => {
    const client = clientFor([
      (sql) =>
        sql.includes("vehicle_sessions")
          ? { rows: [{ id: VEHICLE, nickname: "Ram" }], rowCount: 1 }
          : null,
      (sql) => (sql.includes("UPDATE expenses") ? { rows: [], rowCount: 1 } : null),
      (sql) =>
        sql.includes("SELECT id FROM vehicle_fuel_logs")
          ? { rows: [{ id: FUEL_LOG }], rowCount: 1 }
          : null,
      (sql) => (sql.includes("UPDATE vehicle_fuel_logs") ? { rows: [], rowCount: 1 } : null),
    ]);

    const result = await attachFuelExpenseToVehicle(client, {
      accountId: ACCOUNT,
      userId: USER,
      expenseId: EXPENSE,
      category: "fuel",
      expenseDate: "2026-08-18",
      gallons: 20,
    });
    expect(result.fuelLogId).toBe(FUEL_LOG);
    const insert = (client.query as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO vehicle_fuel_logs"),
    );
    expect(insert).toBeUndefined();
    const updateLog = (client.query as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).includes("UPDATE vehicle_fuel_logs"),
    );
    expect(updateLog?.[1]?.[0]).toBe(VEHICLE);
    expect(updateLog?.[1]?.[1]).toBe(20);
  });
});
