import { z } from "zod";

/**
 * Opening fields shared by every route that accepts rooms. Optional: absent
 * means "not counted yet" (TASK-178). Mirrors `AssessmentRoom` in
 * packages/domain; zod strips anything not listed here.
 */
export const assessmentRoomOpeningFields = {
  door_count: z.number().int().min(0).max(50).optional(),
  window_count: z.number().int().min(0).max(50).optional(),
  openings: z
    .array(z.object({ label: z.string().max(60), width_in: z.number().positive().max(600) }))
    .max(20)
    .optional(),
  wall_sqft_override: z.number().min(0).max(100_000).optional(),
  // TASK-184: vaulted peak, walls to paint, and areas left unpainted.
  peak_height_ft: z.number().positive().max(100).optional(),
  wall_lengths: z
    .array(z.object({ label: z.string().max(60), length_ft: z.number().positive().max(1_000) }))
    .max(20)
    .optional(),
  skip_areas: z
    .array(z.object({ label: z.string().max(60), width_ft: z.number().positive().max(1_000), height_ft: z.number().positive().max(100) }))
    .max(20)
    .optional(),
};

/** What the assessment API accepts for one room. */
export const assessmentRoomSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  length_ft: z.number().min(0).nullable().optional(),
  width_ft: z.number().min(0).nullable().optional(),
  height_ft: z.number().min(0).nullable().optional(),
  notes: z.string().max(500).optional(),
  ...assessmentRoomOpeningFields,
});

export type AssessmentRoomInput = z.infer<typeof assessmentRoomSchema>;
