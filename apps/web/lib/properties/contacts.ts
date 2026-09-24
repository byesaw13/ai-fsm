import { z } from "zod";

export const PROPERTY_CONTACT_ROLES = [
  "owner",
  "realtor",
  "beneficiary",
  "property_manager",
  "tenant",
  "other",
] as const;

export const propertyContactBody = z
  .object({
    client_id: z.string().uuid().nullable().optional(),
    external_name: z.string().trim().min(1).max(255).nullable().optional(),
    external_email: z.string().email().max(255).nullable().optional(),
    external_phone: z.string().max(50).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    role: z.enum(PROPERTY_CONTACT_ROLES),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.client_id) === Boolean(value.external_name)) {
      ctx.addIssue({ code: "custom", message: "Choose one registered client or one external name" });
    }
    if (value.client_id && (value.external_email || value.external_phone)) {
      ctx.addIssue({ code: "custom", message: "Registered-client contact details come from the client card" });
    }
  });

export type PropertyContactInput = z.infer<typeof propertyContactBody>;
