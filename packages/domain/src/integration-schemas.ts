import { z } from "zod";

const uuidField = z.string().uuid();
const timestampField = z.string().datetime();

// === Paperless-ngx integration ===

export const documentLinkEntityTypeSchema = z.enum([
  "expense",
  "job",
  "client",
  "property",
  "invoice",
  "estimate",
]);

export const documentLinkSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  entity_type: documentLinkEntityTypeSchema,
  entity_id: uuidField,
  paperless_doc_id: z.number().int().positive(),
  title: z.string().nullable().optional(),
  original_filename: z.string().nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
});

export const createDocumentLinkSchema = z.object({
  entity_type: documentLinkEntityTypeSchema,
  entity_id: z.string().uuid(),
  paperless_doc_id: z.number().int().positive(),
  title: z.string().max(500).nullable().optional(),
  original_filename: z.string().max(500).nullable().optional(),
});

// === Homebox asset integration ===

export const assetLinkEntityTypeSchema = z.enum(["job", "visit"]);

export const assetLinkStatusSchema = z.enum(["planned", "on_site", "returned"]);

export const assetLinkSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  entity_type: assetLinkEntityTypeSchema,
  entity_id: uuidField,
  homebox_item_id: z.string().uuid(),
  cached_name: z.string().nullable().optional(),
  cached_location: z.string().nullable().optional(),
  status: assetLinkStatusSchema,
  created_by: uuidField,
  created_at: timestampField,
});