import { z } from "zod";
import {
  ESTIMATE_ADJUSTMENT_TYPES,
  ESTIMATE_FINISH_EXPECTATIONS,
  ESTIMATE_MINIMUM_OVERRIDE_REASONS,
  ESTIMATE_PRICING_REVIEW_STATUSES,
  ESTIMATE_TRIP_COUNT_OPTIONS,
  PRICING_MODES,
} from "./dovetails";

export const estimateAdjustmentTypeSchema = z.enum(ESTIMATE_ADJUSTMENT_TYPES);
export type EstimateAdjustmentType = z.infer<typeof estimateAdjustmentTypeSchema>;

export const pricingModeSchema = z.enum(PRICING_MODES);
export type PricingMode = z.infer<typeof pricingModeSchema>;

export const estimateTripCountSchema = z.enum(ESTIMATE_TRIP_COUNT_OPTIONS);
export type EstimateTripCount = z.infer<typeof estimateTripCountSchema>;

export const estimateFinishExpectationSchema = z.enum(ESTIMATE_FINISH_EXPECTATIONS);
export type EstimateFinishExpectation = z.infer<typeof estimateFinishExpectationSchema>;

export const estimateMinimumOverrideReasonSchema = z.enum(ESTIMATE_MINIMUM_OVERRIDE_REASONS);

export const estimatePricingReviewStatusSchema = z.enum(ESTIMATE_PRICING_REVIEW_STATUSES);