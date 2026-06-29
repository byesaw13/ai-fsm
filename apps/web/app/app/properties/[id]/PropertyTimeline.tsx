import Link from "next/link";
import type { Route } from "next";
import { formatCents } from "@/lib/money";

export type TimelineEventType = "visit" | "estimate" | "invoice" | "payment" | "work_order" | "vault_item" | "membership" | "photo" | "issue" | "note";

export type TimelineEvent = {
  event_type: TimelineEventType;
  id: string;
  ts: string;
  label: string;
  detail: string;
  link_id: string | null;
  total_cents: number | null;
};

const DOT_COLORS: Record<TimelineEventType, string> = {
  visit:      "var(--color-primary)",
  estimate:   "var(--color-warning)",
  invoice:    "var(--color-success)",
  payment:    "#16a34a",
  work_order: "#7c3aed",
  vault_item: "#0891b2",
  membership: "#8b5cf6",
  photo:      "#0891b2",
  issue:      "#dc2626",
  note:       "#6b7280",
};

const TYPE_CHIP: Record<TimelineEventType, string> = {
  visit:      "Visit",
  estimate:   "Estimate",
  invoice:    "Invoice",
  payment:    "Payment",
  work_order: "Work Order",
  vault_item: "Vault Item",
  membership: "Membership",
  photo:      "Photo",
  issue:      "Issue",
  note:       "Note",
};

export function eventHrefFor(event: TimelineEvent): string | null {
  if (!event.link_id) return null;
  switch (event.event_type) {
    case "visit":     return `/app/visits/${event.link_id}`;
    case "estimate":  return `/app/estimates/${event.link_id}`;
    case "invoice":   return `/app/invoices/${event.link_id}`;
    case "payment":   return `/app/invoices/${event.link_id}`;
    case "work_order": return `/app/work-orders/${event.link_id}`;
    default:          return null;
  }
}

// Keep the old name for backward compatibility within this file
function eventHref(event: TimelineEvent): string | null {
  return eventHrefFor(event);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}


export function PropertyTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", padding: "var(--space-4) 0" }}>
        No activity at this property yet.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {events.map((event, i) => {
        const color = DOT_COLORS[event.event_type];
        const href = eventHref(event);
        const isLast = i === events.length - 1;

        return (
          <div key={`${event.event_type}-${event.id}`} style={{ display: "flex", gap: "var(--space-3)" }}>
            {/* Dot + line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              {!isLast && (
                <div style={{ width: 2, flex: 1, background: "var(--color-border)", marginTop: 4, marginBottom: 4 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: isLast ? 0 : "var(--space-4)", minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: 2 }}>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    color,
                    background: `${color}18`,
                    padding: "1px 7px",
                    borderRadius: 99,
                  }}
                >
                  {TYPE_CHIP[event.event_type]}
                </span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  {formatDate(event.ts)}
                </span>
                {event.total_cents != null && (
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--fg-secondary)" }}>
                    {formatCents(event.total_cents)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                {href ? (
                  <Link href={href as Route} style={{ color: "var(--fg-primary)", textDecoration: "none" }}>
                    {event.label}
                  </Link>
                ) : (
                  event.label
                )}
              </div>
              {event.detail && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                  {event.detail.replaceAll("_", " ")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
