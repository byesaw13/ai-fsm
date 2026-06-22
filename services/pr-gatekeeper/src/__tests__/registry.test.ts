import { describe, it, expect } from "vitest";
import { z } from "zod";
import { tools } from "../tools/index.js";

const EXPECTED = [
  "analyze_pr",
  "simulate_merge_to_main",
  "run_repo_checks",
  "check_migrations",
  "check_changed_api_contracts",
  "check_dovetails_business_rules",
  "generate_merge_report",
];

describe("tool registry", () => {
  it("exposes exactly the seven gatekeeper tools", () => {
    expect(new Set(tools.map((t) => t.name))).toEqual(new Set(EXPECTED));
    expect(tools).toHaveLength(EXPECTED.length);
  });

  it("each tool has a unique name, description, and valid input shape", () => {
    const names = new Set<string>();
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(names.has(t.name)).toBe(false);
      names.add(t.name);
      expect(t.description.length).toBeGreaterThan(10);
      expect(() => z.object(t.inputShape)).not.toThrow();
    }
  });

  it("every tool requires a pr_number", () => {
    for (const t of tools) {
      const schema = z.object(t.inputShape);
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ pr_number: 1 }).success).toBe(true);
    }
  });
});
