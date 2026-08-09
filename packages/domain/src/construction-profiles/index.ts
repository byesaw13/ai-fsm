import type { TradeCategory, TradeConstructionProfile, ConcealedRiskRule, RequiredHardwareRule } from "./types";
import { CARPENTRY_CONSTRUCTION_PROFILE } from "./carpentry";
import { ELECTRICAL_CONSTRUCTION_PROFILE } from "./electrical";
import { PAINTING_CONSTRUCTION_PROFILE } from "./painting";
import { PLUMBING_CONSTRUCTION_PROFILE } from "./plumbing";
import { DRYWALL_CONSTRUCTION_PROFILE } from "./drywall";

export * from "./types";
export { CARPENTRY_CONSTRUCTION_PROFILE } from "./carpentry";
export { ELECTRICAL_CONSTRUCTION_PROFILE } from "./electrical";
export { PAINTING_CONSTRUCTION_PROFILE } from "./painting";
export { PLUMBING_CONSTRUCTION_PROFILE } from "./plumbing";
export { DRYWALL_CONSTRUCTION_PROFILE } from "./drywall";

export const CONSTRUCTION_PROFILES: Record<TradeCategory, TradeConstructionProfile> = {
  carpentry: CARPENTRY_CONSTRUCTION_PROFILE,
  electrical: ELECTRICAL_CONSTRUCTION_PROFILE,
  painting: PAINTING_CONSTRUCTION_PROFILE,
  plumbing: PLUMBING_CONSTRUCTION_PROFILE,
  drywall: DRYWALL_CONSTRUCTION_PROFILE,
  general: CARPENTRY_CONSTRUCTION_PROFILE,
};

export function detectTradeProfiles(scopeText: string): TradeConstructionProfile[] {
  const text = scopeText.toLowerCase();
  const matched: TradeConstructionProfile[] = [];

  if (text.includes("trim") || text.includes("garage") || text.includes("pvc") || text.includes("door") || text.includes("window") || text.includes("wood") || text.includes("rot")) {
    matched.push(CARPENTRY_CONSTRUCTION_PROFILE);
  }
  if (text.includes("light") || text.includes("chandelier") || text.includes("fan") || text.includes("wire") || text.includes("switch") || text.includes("outlet") || text.includes("electrical")) {
    matched.push(ELECTRICAL_CONSTRUCTION_PROFILE);
  }
  if (text.includes("paint") || text.includes("stain") || text.includes("wall") || text.includes("ceiling") || text.includes("prep")) {
    matched.push(PAINTING_CONSTRUCTION_PROFILE);
  }
  if (text.includes("faucet") || text.includes("toilet") || text.includes("sink") || text.includes("pipe") || text.includes("valve") || text.includes("drain")) {
    matched.push(PLUMBING_CONSTRUCTION_PROFILE);
  }
  if (text.includes("drywall") || text.includes("patch") || text.includes("hole") || text.includes("sheetrock") || text.includes("plaster")) {
    matched.push(DRYWALL_CONSTRUCTION_PROFILE);
  }

  return matched.length > 0 ? matched : [CARPENTRY_CONSTRUCTION_PROFILE];
}

export function getConcealedRiskDisclaimers(scopeText: string): ConcealedRiskRule[] {
  const profiles = detectTradeProfiles(scopeText);
  const text = scopeText.toLowerCase();
  const risks: ConcealedRiskRule[] = [];

  for (const profile of profiles) {
    for (const risk of profile.concealedRisks) {
      if (risk.triggerKeywords.some((kw) => text.includes(kw.toLowerCase()))) {
        if (!risks.some((r) => r.riskName === risk.riskName)) {
          risks.push(risk);
        }
      }
    }
  }

  return risks;
}

export function getRequiredHardwareRules(scopeText: string): RequiredHardwareRule[] {
  const profiles = detectTradeProfiles(scopeText);
  const text = scopeText.toLowerCase();
  const hardware: RequiredHardwareRule[] = [];

  for (const profile of profiles) {
    for (const rule of profile.requiredHardware) {
      if (rule.triggerKeywords.some((kw) => text.includes(kw.toLowerCase()))) {
        if (!hardware.some((h) => h.productName === rule.productName)) {
          hardware.push(rule);
        }
      }
    }
  }

  return hardware;
}
