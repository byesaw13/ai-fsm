import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { propertyContactBody } from "../contacts";

describe("propertyContactBody", () => {
  const clientId = randomUUID();

  it("requires exactly one registered or external identity", () => {
    expect(() =>
      propertyContactBody.parse({ client_id: clientId, external_name: "Emma", role: "beneficiary" }),
    ).toThrow();
    expect(propertyContactBody.parse({ external_name: "Emma", role: "beneficiary" }).external_name).toBe("Emma");
    expect(() =>
      propertyContactBody.parse({ client_id: clientId, external_email: "copy@example.com", role: "realtor" }),
    ).toThrow();
  });
});
