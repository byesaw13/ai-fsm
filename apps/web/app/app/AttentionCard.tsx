import Link from "next/link";
import type { Route } from "next";
import type { SessionPayload } from "@/lib/auth/session";
import { withDbSession } from "@/lib/db";
import { loadAttentionSummary, listAttentionEvents } from "@/lib/attention";
import { Card, SectionHeader } from "@/components/ui";

function relativeTime(iso: string | Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function AttentionCard({ session }: { session: SessionPayload }) {
  if (session.role !== "owner" && session.role !== "admin") return null;

  const { summary, events } = await withDbSession(session, async (client) => {
    const summary = await loadAttentionSummary(client, session.accountId);
    const events = await listAttentionEvents(client, session.accountId, 5);
    return { summary, events };
  });

  const parts: string[] = [];
  if (summary.requestsCount > 0) {
    parts.push(
      `${summary.requestsCount} open request${summary.requestsCount === 1 ? "" : "s"}`,
    );
  }
  if (summary.invoicesCount > 0) {
    parts.push(
      `${summary.invoicesCount} invoice${summary.invoicesCount === 1 ? "" : "s"} need attention`,
    );
  }
  if (summary.unreadEventCount > 0) {
    parts.push(
      `${summary.unreadEventCount} new event${summary.unreadEventCount === 1 ? "" : "s"}`,
    );
  }

  if (parts.length === 0 && events.length === 0) {
    return (
      <Card data-testid="attention-card" style={{ marginBottom: "var(--space-4)" }}>
        <SectionHeader title="Attention" />
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          All caught up — no open request/invoice queues and nothing new in the last 90 days.
        </p>
      </Card>
    );
  }

  return (
    <Card data-testid="attention-card" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader title="Attention" />
      {parts.length > 0 && (
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {parts.join(" · ")}{" "}
          <Link href={"/app/requests" as Route} style={{ marginLeft: 8 }}>
            Requests
          </Link>
          {" · "}
          <Link href={"/app/invoices" as Route}>Invoices</Link>
        </p>
      )}
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {events.map((e) => {
          const unread = !e.read_at;
          return (
            <Link
              key={e.id}
              href={e.href as Route}
              style={{
                display: "block",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                textDecoration: "none",
                color: "inherit",
                background: unread
                  ? "color-mix(in srgb, var(--color-success, #16a34a) 8%, transparent)"
                  : "transparent",
              }}
            >
              <div style={{ fontSize: "var(--text-sm)", fontWeight: unread ? 700 : 500 }}>
                {e.title}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                {[e.summary, relativeTime(e.created_at)].filter(Boolean).join(" · ")}
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
