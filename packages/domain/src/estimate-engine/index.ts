export * from "./types";
export * from "./rules";
export { computeEstimate } from "./engine";
export { evaluateGuardrails } from "./guardrails";
export {
  sqftPaintingToSpec,
  roomSpecsToEstimateSpec,
  estimateResultToLegacyFields,
  buildShoppingListFromEstimateResult,
  computeSqftPaintingResult,
  computeSqftPaintingEstimate,
  type SqftPaintingInput,
  type SqftPaintingResult,
  type LegacyPaintingFields,
} from "./adapters";
