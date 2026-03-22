/**
 * Unit tests for visit checklist helpers.
 *
 * Tier 1/2: pure logic and mocked-DB behavior.
 * Tests cover: template structure (28 items, 6 sections), seeding
 * idempotency, update logic, and disposition schema validation.
 *
 * API route behavior (GET/PATCH) is covered in:
 *   apps/web/app/api/v1/visits/__tests__/visits.unit.test.ts (checklist routes section)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB pool
// ---------------------------------------------------------------------------
const mockClientQuery = vi.fn();
const mockPool = { connect: vi.fn() };

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({
    query: mockClientQuery,
    release: vi.fn(),
  });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------
import {
  DEFAULT_CHECKLIST_TEMPLATE,
  seedChecklistItems,
  getOrSeedChecklist,
  updateChecklistItem,
} from "../checklist";
import {
  CHECKLIST_SECTIONS,
  CHECKLIST_DISPOSITION_LABELS,
  checklistDispositionSchema,
} from "@ai-fsm/domain";

const ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const VISIT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ITEM_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

// ---------------------------------------------------------------------------
// DEFAULT_CHECKLIST_TEMPLATE — structure
// ---------------------------------------------------------------------------

describe("DEFAULT_CHECKLIST_TEMPLATE", () => {
  it("has exactly 28 items", () => {
    expect(DEFAULT_CHECKLIST_TEMPLATE).toHaveLength(28);
  });

  it("covers all 6 SOP sections", () => {
    const sections = [...new Set(DEFAULT_CHECKLIST_TEMPLATE.map((i) => i.section))];
    expect(sections).toHaveLength(6);
    for (const section of CHECKLIST_SECTIONS) {
      expect(sections).toContain(section);
    }
  });

  it("Exterior has 7 items", () => {
    expect(DEFAULT_CHECKLIST_TEMPLATE.filter((i) => i.section === "Exterior")).toHaveLength(7);
  });

  it("Interior — Living Areas has 5 items", () => {
    expect(
      DEFAULT_CHECKLIST_TEMPLATE.filter((i) => i.section === "Interior — Living Areas")
    ).toHaveLength(5);
  });

  it("Kitchen has 4 items", () => {
    expect(DEFAULT_CHECKLIST_TEMPLATE.filter((i) => i.section === "Kitchen")).toHaveLength(4);
  });

  it("Bathrooms has 5 items", () => {
    expect(DEFAULT_CHECKLIST_TEMPLATE.filter((i) => i.section === "Bathrooms")).toHaveLength(5);
  });

  it("Basement / Utility / Mechanical has 4 items", () => {
    expect(
      DEFAULT_CHECKLIST_TEMPLATE.filter((i) => i.section === "Basement / Utility / Mechanical")
    ).toHaveLength(4);
  });

  it("Attic / Upper Areas has 3 items", () => {
    expect(
      DEFAULT_CHECKLIST_TEMPLATE.filter((i) => i.section === "Attic / Upper Areas")
    ).toHaveLength(3);
  });

  it("all item_keys are unique across the template", () => {
    const keys = DEFAULT_CHECKLIST_TEMPLATE.map((i) => i.item_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("all items have non-empty label and item_key", () => {
    for (const item of DEFAULT_CHECKLIST_TEMPLATE) {
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.item_key.trim().length).toBeGreaterThan(0);
    }
  });

  it("sort_order starts at 0 in every section", () => {
    for (const section of CHECKLIST_SECTIONS) {
      const items = DEFAULT_CHECKLIST_TEMPLATE.filter((i) => i.section === section);
      expect(Math.min(...items.map((i) => i.sort_order))).toBe(0);
    }
  });

  it("item_keys use only lowercase letters, digits, and underscores", () => {
    for (const item of DEFAULT_CHECKLIST_TEMPLATE) {
      expect(item.item_key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("every section in the template is a known SOP section", () => {
    for (const item of DEFAULT_CHECKLIST_TEMPLATE) {
      expect(CHECKLIST_SECTIONS as readonly string[]).toContain(item.section);
    }
  });
});

// ---------------------------------------------------------------------------
// Disposition schema
// ---------------------------------------------------------------------------

describe("checklistDispositionSchema", () => {
  it("accepts all five valid values", () => {
    for (const val of ["ok", "fix_now", "monitor", "optional", "refer"]) {
      expect(checklistDispositionSchema.safeParse(val).success).toBe(true);
    }
  });

  it("rejects invalid values", () => {
    for (const val of ["good", "bad", "great", "", "OK", "Fix Now"]) {
      expect(checklistDispositionSchema.safeParse(val).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// CHECKLIST_DISPOSITION_LABELS
// ---------------------------------------------------------------------------

describe("CHECKLIST_DISPOSITION_LABELS", () => {
  it("has a label for every valid disposition", () => {
    for (const d of ["ok", "fix_now", "monitor", "optional", "refer"] as const) {
      expect(CHECKLIST_DISPOSITION_LABELS[d]).toBeTruthy();
    }
  });

  it("fix_now label is 'Fix Now'", () => {
    expect(CHECKLIST_DISPOSITION_LABELS.fix_now).toBe("Fix Now");
  });

  it("refer label is 'Refer to Trade'", () => {
    expect(CHECKLIST_DISPOSITION_LABELS.refer).toBe("Refer to Trade");
  });

  it("ok label is 'OK'", () => {
    expect(CHECKLIST_DISPOSITION_LABELS.ok).toBe("OK");
  });
});

// ---------------------------------------------------------------------------
// seedChecklistItems
// ---------------------------------------------------------------------------

describe("seedChecklistItems", () => {
  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const client = { query: mockClientQuery } as any;
    await seedChecklistItems(client, ACCOUNT_ID, VISIT_ID);

    const insertCall = mockClientQuery.mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes("INSERT INTO visit_checklist_items")
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toContain("ON CONFLICT (visit_id, item_key) DO NOTHING");
  });

  it("passes 28 × 6 = 168 parameter values", async () => {
    const client = { query: mockClientQuery } as any;
    await seedChecklistItems(client, ACCOUNT_ID, VISIT_ID);

    const insertCall = mockClientQuery.mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes("INSERT INTO visit_checklist_items")
    );
    const params = insertCall![1] as unknown[];
    expect(params).toHaveLength(28 * 6);
  });

  it("first two params are accountId and visitId", async () => {
    const client = { query: mockClientQuery } as any;
    await seedChecklistItems(client, ACCOUNT_ID, VISIT_ID);

    const insertCall = mockClientQuery.mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes("INSERT INTO visit_checklist_items")
    );
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe(ACCOUNT_ID);
    expect(params[1]).toBe(VISIT_ID);
  });

  it("includes all required columns in SQL", async () => {
    const client = { query: mockClientQuery } as any;
    await seedChecklistItems(client, ACCOUNT_ID, VISIT_ID);

    const insertCall = mockClientQuery.mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes("INSERT INTO visit_checklist_items")
    );
    const sql = insertCall![0] as string;
    expect(sql).toContain("section");
    expect(sql).toContain("item_key");
    expect(sql).toContain("label");
    expect(sql).toContain("sort_order");
  });
});

// ---------------------------------------------------------------------------
// getOrSeedChecklist
// ---------------------------------------------------------------------------

describe("getOrSeedChecklist", () => {
  it("seeds when count is 0, then returns items", async () => {
    const client = { query: mockClientQuery } as any;
    const itemRow = {
      id: "item-1",
      item_key: "ext_roof_condition",
      section: "Exterior",
      label: "Roof condition (visible)",
      disposition: null,
      note: null,
      sort_order: 0,
      account_id: ACCOUNT_ID,
      visit_id: VISIT_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // COUNT
      .mockResolvedValueOnce({ rows: [], rowCount: 28 }) // INSERT seed
      .mockResolvedValueOnce({ rows: [itemRow] }); // SELECT

    const items = await getOrSeedChecklist(client, ACCOUNT_ID, VISIT_ID);
    expect(items).toHaveLength(1);
    expect(items[0].item_key).toBe("ext_roof_condition");

    // Verify COUNT was first
    expect(mockClientQuery.mock.calls[0][0]).toContain("COUNT(*)");
    // Verify INSERT was called
    expect(
      mockClientQuery.mock.calls.some((args: unknown[]) =>
        (args[0] as string).includes("INSERT INTO visit_checklist_items")
      )
    ).toBe(true);
  });

  it("skips INSERT when items already exist", async () => {
    const client = { query: mockClientQuery } as any;

    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ count: "28" }] }) // COUNT → already seeded
      .mockResolvedValueOnce({ rows: [] }); // SELECT

    await getOrSeedChecklist(client, ACCOUNT_ID, VISIT_ID);

    const insertCall = mockClientQuery.mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes("INSERT INTO visit_checklist_items")
    );
    expect(insertCall).toBeUndefined();
  });

  it("orders results by section, sort_order, item_key", async () => {
    const client = { query: mockClientQuery } as any;

    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ count: "28" }] })
      .mockResolvedValueOnce({ rows: [] });

    await getOrSeedChecklist(client, ACCOUNT_ID, VISIT_ID);

    const selectCall = mockClientQuery.mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes("ORDER BY")
    );
    expect(selectCall![0]).toContain("ORDER BY section, sort_order, item_key");
  });
});

// ---------------------------------------------------------------------------
// updateChecklistItem
// ---------------------------------------------------------------------------

describe("updateChecklistItem", () => {
  it("updates disposition and returns the row", async () => {
    const updated = { id: ITEM_ID, disposition: "ok", note: null };
    mockClientQuery.mockResolvedValueOnce({ rows: [updated] });

    const client = { query: mockClientQuery } as any;
    const result = await updateChecklistItem(client, ACCOUNT_ID, VISIT_ID, ITEM_ID, {
      disposition: "ok",
    });

    expect(result).toEqual(updated);
    const sql = mockClientQuery.mock.calls[0][0] as string;
    expect(sql).toContain("disposition");
    expect(sql).toContain("updated_at");
  });

  it("updates note and returns the row", async () => {
    const updated = { id: ITEM_ID, disposition: null, note: "cracked caulk" };
    mockClientQuery.mockResolvedValueOnce({ rows: [updated] });

    const client = { query: mockClientQuery } as any;
    const result = await updateChecklistItem(client, ACCOUNT_ID, VISIT_ID, ITEM_ID, {
      note: "cracked caulk",
    });
    expect(result?.note).toBe("cracked caulk");
  });

  it("returns null when item not found (empty rows)", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    const client = { query: mockClientQuery } as any;
    const result = await updateChecklistItem(client, ACCOUNT_ID, VISIT_ID, ITEM_ID, {
      disposition: "monitor",
    });
    expect(result).toBeNull();
  });

  it("returns null and skips DB when no patch fields provided", async () => {
    const client = { query: mockClientQuery } as any;
    const result = await updateChecklistItem(client, ACCOUNT_ID, VISIT_ID, ITEM_ID, {});
    expect(result).toBeNull();
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("can clear disposition by passing null", async () => {
    const updated = { id: ITEM_ID, disposition: null, note: null };
    mockClientQuery.mockResolvedValueOnce({ rows: [updated] });

    const client = { query: mockClientQuery } as any;
    const result = await updateChecklistItem(client, ACCOUNT_ID, VISIT_ID, ITEM_ID, {
      disposition: null,
    });
    expect(result?.disposition).toBeNull();
  });

  it("builds UPDATE with both fields when both provided", async () => {
    const updated = { id: ITEM_ID, disposition: "fix_now", note: "needs repair" };
    mockClientQuery.mockResolvedValueOnce({ rows: [updated] });

    const client = { query: mockClientQuery } as any;
    await updateChecklistItem(client, ACCOUNT_ID, VISIT_ID, ITEM_ID, {
      disposition: "fix_now",
      note: "needs repair",
    });
    const sql = mockClientQuery.mock.calls[0][0] as string;
    expect(sql).toContain("disposition");
    expect(sql).toContain("note");
  });
});
