import { describe, expect, it } from "vitest";
import {
  detectTradeProfiles,
  getConcealedRiskDisclaimers,
  getRequiredHardwareRules,
  CONSTRUCTION_PROFILES,
} from "../construction-profiles";

describe("Trade Construction Profiles Engine", () => {
  it("detects carpentry profile for garage PVC trim scope", () => {
    const scope = "replace rotted garage door trim with PVC boards";
    const profiles = detectTradeProfiles(scope);

    expect(profiles.some((p) => p.tradeKey === "carpentry")).toBe(true);
  });

  it("detects electrical profile for 20ft foyer chandelier", () => {
    const scope = "hang chandelier in 20ft foyer";
    const profiles = detectTradeProfiles(scope);

    expect(profiles.some((p) => p.tradeKey === "electrical")).toBe(true);
  });

  it("extracts concealed risk disclaimers for rotted wood trim", () => {
    const scope = "replace rotted trim on single stall garage";
    const risks = getConcealedRiskDisclaimers(scope);

    expect(risks.some((r) => r.riskName.includes("Substrate"))).toBe(true);
    expect(risks[0].changeOrderDisclaimer).toContain("Change Order");
  });

  it("extracts required hardware rules for PVC trim", () => {
    const scope = "replace garage trim with PVC";
    const hardware = getRequiredHardwareRules(scope);

    expect(hardware.some((h) => h.productName.includes("OSI Quad Max"))).toBe(true);
    expect(hardware.some((h) => h.productName.includes("Cortex"))).toBe(true);
  });

  it("includes NEC code notes in electrical profile", () => {
    const electrical = CONSTRUCTION_PROFILES.electrical;
    expect(electrical.buildingCodeNotes?.some((n) => n.includes("NEC 314.27"))).toBe(true);
  });
});
