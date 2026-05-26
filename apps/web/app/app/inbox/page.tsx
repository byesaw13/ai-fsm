"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Card, PageContainer, PageHeader } from "@/components/ui";

interface ActionItem {
  id: string;
  entity_type: "booking_request" | "estimate" | "job" | "invoice";
  entity_id: string;
  action_type: string;
  title: string;
  due_at: string | null;
  created_at: string;
}

const ENTITY_HREFS: Record<string, string> = {
  booking_request: "/app/booking-requests",
  estimate:        "/app/estimates",
  job:             "/app/jobs",
  invoice:         "/app/invoices",
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  review_intake:  { label: "Review intake",     color: "var(--status-warning, #92400e)" },
  send_estimate:  { label: "Send estimate",     color: "var(--accent)" },
  schedule_job:   { label: "Schedule job",      color: "var(--status-info, #1d4ed8)" },
  create_invoice: { label: "Invoice ready",     color: "var(--status-success, #166534)" },
  send_invoice:   { label: "Send invoice",      color: "var(--accent)" },
  follow_up:      { label: "Follow up",         color: "var(--status-error, #991b1b)" },
};

function entityHref(entityType: string, entityId: string): string {
  return `${ENTITY_HREFS[entityType] ?? "/app"}/${entityId}`;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InboxPage() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/action-items").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setItems(data.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function dismiss(id: string) {
    setResolving(prev => new Set(prev).add(id));
    await fetch(`/api/v1/action-items/${id}`, { method: "PATCH" });
    setItems(prev => prev.filter(i => i.id !== id));
    setResolving(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  const grouped = items.reduce<Record<string, ActionItem[]>>((acc, item) => {
    const key = item.action_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <PageContainer>
      <PageHeader
        title="Inbox"
        subtitle={items.length === 0 && !loading ? "All caught up" : `${items.length} open action${items.length !== 1 ? "s" : ""}`}
      />

      {loading ? (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)" }}>
            <div style={{ fontSize: 40, marginBottom: "var(--space-3)" }}>✓</div>
            <p style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 600 }}>Nothing to action right now.</p>
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              New items appear here when intake comes in, estimates need sending, jobs complete, or invoices are due.
            </p>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {Object.entries(grouped).map(([actionType, group]) => {
            const meta = ACTION_LABELS[actionType] ?? { label: actionType, color: "var(--fg)" };
            return (
              <Card key={actionType}>
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <span style={{
                    display: "inline-block",
                    fontSize: "var(--text-xs)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    color: meta.color,
                  }}>
                    {meta.label}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {group.map((item, idx) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        padding: "var(--space-3) 0",
                        borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          href={entityHref(item.entity_type, item.entity_id) as Route}
                          style={{ color: "var(--fg)", textDecoration: "none", fontWeight: 600, fontSize: "var(--text-sm)" }}
                        >
                          {item.title}
                        </Link>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                          {timeAgo(item.created_at)}
                          {item.due_at && (
                            <span style={{ marginLeft: "var(--space-2)", color: "var(--status-error, #991b1b)" }}>
                              · due {new Date(item.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                        <Link
                          href={entityHref(item.entity_type, item.entity_id) as Route}
                          className="p7-btn p7-btn-primary"
                          style={{ fontSize: "var(--text-xs)", padding: "4px 10px" }}
                        >
                          Go →
                        </Link>
                        <button
                          onClick={() => dismiss(item.id)}
                          disabled={resolving.has(item.id)}
                          className="p7-btn p7-btn-ghost"
                          style={{ fontSize: "var(--text-xs)", padding: "4px 10px" }}
                        >
                          {resolving.has(item.id) ? "…" : "Dismiss"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
