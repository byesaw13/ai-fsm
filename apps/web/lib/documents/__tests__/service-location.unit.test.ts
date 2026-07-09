import { describe, it, expect } from "vitest";
import {
  formatAddressLine,
  resolveServiceLocation,
  documentJoins,
  documentLocationSelect,
} from "../service-location";

describe("formatAddressLine / resolveServiceLocation", () => {
  it("formats street, city/state, zip", () => {
    expect(formatAddressLine("1 Main St", "Nashua", "NH", "03060")).toBe(
      "1 Main St, Nashua, NH, 03060",
    );
  });

  it("prefers property over client address", () => {
    expect(
      resolveServiceLocation({
        property_address: "9 Oak",
        property_city: "Salem",
        property_state: "NH",
        property_zip: "03079",
        client_address_line1: "billing only",
        client_city: "X",
        client_state: "MA",
        client_zip: "02108",
      }),
    ).toBe("9 Oak, Salem, NH, 03079");
  });

  it("falls back to client then placeholder", () => {
    expect(
      resolveServiceLocation({
        client_address_line1: "2 Elm",
        client_city: "Boston",
        client_state: "MA",
        client_zip: "02108",
      }),
    ).toBe("2 Elm, Boston, MA, 02108");
    expect(resolveServiceLocation({})).toBe("Address not on file");
  });
});

describe("documentJoins", () => {
  it("invoice joins include estimate property coalesce", () => {
    const sql = documentJoins({ root: "i", includeEstimateProperty: true });
    expect(sql).toContain("JOIN clients c ON c.id = i.client_id");
    expect(sql).toContain("LEFT JOIN jobs j ON j.id = i.job_id");
    expect(sql).toContain("LEFT JOIN estimates e ON e.id = i.estimate_id");
    expect(sql).toContain("i.property_id");
    expect(sql).toContain("e.property_id");
    expect(sql).toContain("i.account_id");
    expect(sql).not.toContain("e.account_id");
  });

  it("estimate joins omit estimate self-join and use e.account_id", () => {
    const sql = documentJoins({ root: "e" });
    expect(sql).toContain("JOIN clients c ON c.id = e.client_id");
    expect(sql).toContain("LEFT JOIN jobs j ON j.id = e.job_id");
    expect(sql).not.toMatch(/LEFT JOIN estimates e ON/);
    expect(sql).toContain("e.property_id");
    expect(sql).toContain("e.account_id");
    expect(sql).not.toContain("i.account_id");
  });

  it("location select lists client and property columns", () => {
    const inv = documentLocationSelect({ includeEstimateProperty: true });
    expect(inv).toContain("c.name AS client_name");
    expect(inv).toContain("p.address AS property_address");
    expect(inv).toContain("e.property_id AS estimate_property_id");
    expect(inv).toContain("p.id AS resolved_property_id");

    const est = documentLocationSelect();
    expect(est).not.toContain("estimate_property_id");
    expect(est).toContain("j.property_id AS job_property_id");
  });
});
