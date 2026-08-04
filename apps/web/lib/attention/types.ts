/** Attention event types (v1) — see docs/superpowers/specs/2026-08-04-in-app-attention-notifications-design.md */

export const ATTENTION_EVENT_TYPES = [
  "booking_request.created",
  "estimate.opened",
  "estimate.approved",
  "estimate.declined",
  "invoice.opened",
  "invoice.paid",
  "invoice.partial",
] as const;

export type AttentionEventType = (typeof ATTENTION_EVENT_TYPES)[number];

export const ATTENTION_ENTITY_TYPES = [
  "booking_request",
  "estimate",
  "invoice",
] as const;

export type AttentionEntityType = (typeof ATTENTION_ENTITY_TYPES)[number];

export const ATTENTION_RETENTION_DAYS = 90;

export interface AttentionEventRow {
  id: string;
  account_id: string;
  type: AttentionEventType | string;
  entity_type: string;
  entity_id: string;
  title: string;
  summary: string | null;
  href: string;
  dedupe_key: string | null;
  created_at: string | Date;
  read_at: string | Date | null;
}

export interface AttentionSummary {
  requestsCount: number;
  invoicesCount: number;
  estimatesCount: number;
  unreadEventCount: number;
}

/** Types that trigger owner email via notification_queue (not partial). */
export const ATTENTION_EMAIL_TYPES = [
  "invoice.opened",
  "invoice.paid",
  "estimate.approved",
  "estimate.declined",
] as const;

export type AttentionEmailType = (typeof ATTENTION_EMAIL_TYPES)[number];

export interface EmitAttentionEventInput {
  accountId: string;
  type: AttentionEventType;
  entityType: AttentionEntityType;
  entityId: string;
  title: string;
  summary?: string | null;
  href: string;
  /** When set, unique per account — second emit is a no-op. */
  dedupeKey?: string | null;
}
