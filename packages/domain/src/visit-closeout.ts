import { z } from "zod";

export const VISIT_CLOSEOUT_KINDS = ["done", "return"] as const;
export type VisitCloseoutKind = (typeof VISIT_CLOSEOUT_KINDS)[number];

export const visitCloseoutKindSchema = z.enum(VISIT_CLOSEOUT_KINDS);

export const CLOSEOUT_NEXT_WHEN = ["tomorrow", "date", "unsure"] as const;
export type CloseoutNextWhen = (typeof CLOSEOUT_NEXT_WHEN)[number];

const DUMP_RE =
  /\b(dump(?:ing)?|transfer station|debris|disposal|recycles|demo debris)\b/i;

/** Disposal / dump-run expenses billed on their own invoice line. */
export function isDumpExpense(input: {
  vendor_name?: string | null;
  notes?: string | null;
  category?: string | null;
}): boolean {
  const blob = `${input.vendor_name ?? ""} ${input.notes ?? ""}`;
  if (DUMP_RE.test(blob)) return true;
  if ((input.category ?? "") === "other" && DUMP_RE.test(blob)) return true;
  return false;
}

/** Stack completed-visit day logs into one labor description (oldest first). */
export function laborDescriptionFromVisitNotes(
  notes: Array<string | null | undefined>,
  fallback: string,
): string {
  const lines = notes
    .map((n) => (n ?? "").trim())
    .filter((n) => n.length > 0);
  if (lines.length === 0) return fallback.trim() || "Labor";
  if (lines.length === 1) return lines[0];
  return lines.join("\n");
}

export const visitCloseoutBodySchema = z
  .object({
    kind: visitCloseoutKindSchema,
    today_notes: z.string().trim().min(1, "What did you do today is required"),
    next_when: z.enum(CLOSEOUT_NEXT_WHEN).optional(),
    next_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    first_up: z.string().trim().min(1).max(300).optional(),
    send_invoice: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "return") {
      if (!val.next_when) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "When are you back is required",
          path: ["next_when"],
        });
      }
      if (val.next_when === "date" && !val.next_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pick a date",
          path: ["next_date"],
        });
      }
      if (!val.first_up) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "What’s first when you get here is required",
          path: ["first_up"],
        });
      }
    }
  });

export type VisitCloseoutBody = z.infer<typeof visitCloseoutBodySchema>;
