import { z } from "zod";

/**
 * What the assessment API accepts for one room. Opening fields are optional:
 * absent means "not counted yet" (TASK-178). Mirrors `AssessmentRoom` in
 * packages/domain; zod strips anything not listed here.
 */
export const assessmentRoomSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  length_ft: z.number().min(0).nullable().optional(),
  width_ft: z.number().min(0).nullable().optional(),
  height_ft: z.number().min(0).nullable().optional(),
  notes: z.string().max(500).optional(),
  door_count: z.number().int().min(0).max(50).optional(),
  window_count: z.number().int().min(0).max(50).optional(),
  openings: z
    .array(z.object({ label: z.string().max(60), width_in: z.number().positive().max(600) }))
    .max(20)
    .optional(),
  wall_sqft_override: z.number().min(0).max(100_000).optional(),
});

export type AssessmentRoomInput = z.infer<typeof assessmentRoomSchema>;
