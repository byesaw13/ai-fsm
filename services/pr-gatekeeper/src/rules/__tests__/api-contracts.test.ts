import { describe, it, expect } from "vitest";
import { checkApiContracts } from "../api-contracts.js";
import { file } from "./helpers.js";

const ROUTE = "apps/web/app/api/v1/properties/route.ts";

describe("checkApiContracts", () => {
  it("warns when a route changes with no test or client change", () => {
    const findings = checkApiContracts([file(ROUTE, { added: ["export const POST = ..."] })]);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("api-contracts.route-without-test-or-client");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].file).toBe(ROUTE);
  });

  it("is satisfied by a test change in the same PR", () => {
    const findings = checkApiContracts([
      file(ROUTE, { added: ["export const POST = ..."] }),
      file("apps/web/app/api/v1/properties/__tests__/route.test.ts", { added: ["it('works')"] }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("is satisfied by a client/UI change in the same PR", () => {
    const findings = checkApiContracts([
      file(ROUTE, { added: ["export const POST = ..."] }),
      file("apps/web/app/app/properties/page.tsx", { added: ["<Properties/>"] }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("ignores PRs that change no routes", () => {
    const findings = checkApiContracts([file("apps/web/lib/foo.ts", { added: ["x"] })]);
    expect(findings).toHaveLength(0);
  });

  it("ignores deleted routes", () => {
    const findings = checkApiContracts([file(ROUTE, { status: "D" })]);
    expect(findings).toHaveLength(0);
  });
});
