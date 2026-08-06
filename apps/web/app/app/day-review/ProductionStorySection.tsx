import Link from "next/link";
import type { Route } from "next";
import type { VisitTimelineCard } from "@/lib/visits/load-visit-timeline";
import { VisitTimelinePanel } from "@/components/visits/VisitTimelinePanel";
import { Card, SectionHeader, StatusBadge } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";

export function ProductionStorySection({ cards }: { cards: VisitTimelineCard[] }) {
  return (
    <section style={{ marginBottom: "var(--space-6)" }} data-testid="production-story">
      <SectionHeader title="Production story" count={cards.length || undefined} />
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: "var(--space-3)" }}>
        What happened on each scheduled visit today — activities linked to the visit, in order.
      </p>

      {cards.length === 0 ? (
        <Card>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: 0 }}>
            No scheduled visits this day.
          </p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {cards.map((card) => (
            <Card key={card.visitId} data-testid={`production-story-${card.visitId}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "var(--space-2)",
                  marginBottom: "var(--space-2)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                    {card.propertyName}
                    <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · {card.clientName}</span>
                  </div>
                  {card.jobTitle && (
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{card.jobTitle}</div>
                  )}
                </div>
                <StatusBadge variant={(card.status as StatusVariant) || "scheduled"}>
                  {card.status}
                </StatusBadge>
              </div>

              <VisitTimelinePanel events={card.events} />

              <div style={{ marginTop: "var(--space-3)" }}>
                <Link
                  href={`/app/visits/${card.visitId}` as Route}
                  style={{ color: "var(--accent)", fontSize: "var(--text-sm)", fontWeight: 600 }}
                >
                  Open visit →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
