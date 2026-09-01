import type { Route } from "next";
import { OWNER_PROMISE_ACTION_TYPE, promiseBucketTone } from "@ai-fsm/domain";

export { OWNER_PROMISE_ACTION_TYPE };

export const CUSTOMER_PROMISE_BUCKET_LABEL = "Customer Promises";
export const CUSTOMER_PROMISE_BUCKET_HREF = "/app/action-queue?promises=1";
export const CUSTOMER_PROMISE_BUCKET_DETAIL = "Open captured promises";

export const OPEN_OWNER_PROMISES_SQL = `
  SELECT id, title, entity_type, entity_id, due_at
  FROM action_items
  WHERE account_id = $1
    AND action_type = $2
    AND resolved_at IS NULL
  ORDER BY due_at ASC NULLS LAST, created_at ASC
`;

export type OpenOwnerPromiseRow = {
  id: string;
  title: string;
  entity_type: string;
  entity_id: string;
  due_at: string | Date | null;
};

export type CustomerPromiseBucket = {
  label: typeof CUSTOMER_PROMISE_BUCKET_LABEL;
  count: number;
  href: Route;
  detail: typeof CUSTOMER_PROMISE_BUCKET_DETAIL;
  tone: "danger" | "warning";
};

export function dueAtIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function toPromiseToneInput(
  rows: { due_at: string | Date | null }[],
): { dueAt: string | null }[] {
  return rows.map((row) => ({ dueAt: dueAtIso(row.due_at) }));
}

export function customerPromiseBucket(
  open: { dueAt: string | null }[],
  now: Date = new Date(),
): CustomerPromiseBucket {
  return {
    label: CUSTOMER_PROMISE_BUCKET_LABEL,
    count: open.length,
    href: CUSTOMER_PROMISE_BUCKET_HREF as Route,
    detail: CUSTOMER_PROMISE_BUCKET_DETAIL,
    tone: promiseBucketTone(open, now),
  };
}

export function promiseEntityHref(entityType: string, entityId: string): Route {
  switch (entityType) {
    case "booking_request":
      return `/app/requests/${entityId}` as Route;
    case "estimate":
      return `/app/estimates/${entityId}` as Route;
    case "job":
      return `/app/jobs/${entityId}` as Route;
    case "invoice":
      return `/app/invoices/${entityId}` as Route;
    default:
      return "/app" as Route;
  }
}

export function promiseEntityLabel(entityType: string): string {
  switch (entityType) {
    case "booking_request":
      return "Request";
    case "estimate":
      return "Estimate";
    case "job":
      return "Project";
    case "invoice":
      return "Invoice";
    default:
      return entityType;
  }
}

export function formatPromiseDue(dueAt: string | Date | null, now: Date = new Date()): string {
  const iso = dueAtIso(dueAt);
  if (!iso) return "No due date";
  const due = new Date(iso);
  const label = due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (due.getTime() < now.getTime()) return `Overdue · ${label}`;
  return label;
}

export function shouldShowOpenPromises(count: number, promisesParam: string | undefined): boolean {
  return count > 0 || promisesParam === "1";
}
