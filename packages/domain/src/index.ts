import { z } from "zod";

export const roleSchema = z.enum(["owner", "admin", "tech"]);
export type Role = z.infer<typeof roleSchema>;

export const jobStatusSchema = z.enum([
  "draft",
  "quoted",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced"
]);

export const visitStatusSchema = z.enum([
  "scheduled",
  "arrived",
  "in_progress",
  "completed",
  "cancelled"
]);

export const estimateStatusSchema = z.enum([
  "draft",
  "sent",
  "approved",
  "declined",
  "expired"
]);

export const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void"
]);

export const automationTypeSchema = z.enum([
  "visit_reminder",
  "invoice_followup"
]);

export const jobSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  clientName: z.string().min(1),
  status: jobStatusSchema
});

export type Job = z.infer<typeof jobSchema>;
