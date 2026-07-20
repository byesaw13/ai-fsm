import Link from "next/link";
import type { Route } from "next";

export type ActivityEventType = "visit" | "estimate" | "invoice" | "communication";

export type ActivityEvent = {
  event_type: ActivityEventType;
  id: string;
  ts: string;
  label: string;
  status: string | null;
  link_id: string | null;
  total_cents: number | null;
  property_address: string | null;
};

const DOT_COLORS: Record<ActivityEventType, string> = {
  visit:         "var(--color-primary, #0284c7)",
  estimate:      "#d97706",
  invoice:       "#16a34a",
  communication: "#0891b2",
};

const TYPE_CHIP: Record<ActivityEventType, string> = {
  visit:         "Visit",
  estimate:      "Estimate",
  invoice:       "Invoice",
  communication: "Message",
};

export function eventHref(event: ActivityEvent): string | null {
  switch (event.event_type) {
    case "visit":     return event.link_id ? `/app/visits/${event.link_id}` : null;
    case "estimate":  return event.link_id ? `/app/estimates/${event.link_id}` : null;
    case "invoice":   return event.link_id ? `/app/invoices/${event.link_id}` : null;
    // communication.link_id is job_id when present
    case "communication": return event.link_id ? `/app/jobs/${event.link_id}` : null;
    default:          return null;
  }
}

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function formatEventCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

export function ClientActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", padding: "var(--space-4) 0" }}>
        No activity recorded for this client yet.
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
                <div style={{ width: 2, flex: 1, background: "var(--border, #e5e7eb)", marginTop: 4, marginBottom: 4 }} />
              )}
            </div>

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
                  {formatEventDate(event.ts)}
                </span>
                {event.total_cents != null && (
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--fg-secondary)" }}>
                    {formatEventCents(event.total_cents)}
                  </span>
                )}
                {event.property_address && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    · {event.property_address}
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
              {event.status && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                  {event.status.replaceAll("_", " ")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
