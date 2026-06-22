import { describe, it, expect } from "vitest";
import { z } from "zod";
import { tools } from "../index.js";

const EXPECTED = [
  "get_client_summary",
  "search_clients",
  "get_invoice_status",
  "list_unpaid_invoices",
  "list_open_estimates",
  "get_job_summary",
  "get_recent_payments",
  "get_daily_operations_log",
];

describe("tool registry", () => {
  it("exposes exactly the eight v1 read-only tools", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names)).toEqual(new Set(EXPECTED));
    expect(names.length).toBe(EXPECTED.length);
  });

  it("every tool has unique name, description, and a valid zod input shape", () => {
    const names = new Set<string>();
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(names.has(t.name)).toBe(false);
      names.add(t.name);
      expect(t.description.length).toBeGreaterThan(10);
      // inputShape must build a valid zod object
      expect(() => z.object(t.inputShape)).not.toThrow();
    }
  });
});
