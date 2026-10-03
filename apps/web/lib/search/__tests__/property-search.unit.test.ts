import { describe, expect, it } from "vitest";
import { PROPERTY_SEARCH_SQL, searchLikePattern } from "../property-search";

describe("property search", () => {
  it("ignores a one-character query and escapes LIKE wildcards", () => {
    expect(searchLikePattern(" a ")).toBeNull();
    expect(searchLikePattern("Main")).toBe("%Main%");
    expect(searchLikePattern("100%_off")).toBe("%100\\%\\_off%");
  });

  it("looks up a house by name, street, room, or invoice number", () => {
    expect(PROPERTY_SEARCH_SQL).toContain("c.name ILIKE");
    expect(PROPERTY_SEARCH_SQL).toContain("p.address ILIKE");
    expect(PROPERTY_SEARCH_SQL).toContain("a.rooms::text ILIKE");
    expect(PROPERTY_SEARCH_SQL).toContain("i.invoice_number ILIKE");
    expect(PROPERTY_SEARCH_SQL).toContain("p.account_id = $1");
  });
});
