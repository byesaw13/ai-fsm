import Link from "next/link";
import type { Route } from "next";
import { SectionHeader } from "@/components/ui";
import { CaptureLink } from "@/components/CaptureLink";
import { FIELD_QUICK_ACTIONS } from "@/lib/navigation/quick-actions";

export function FieldQuickActions({ showCapture = false }: { showCapture?: boolean }) {
  return (
    <section data-testid="field-quick-actions">
      {showCapture && (
        <CaptureLink
          data-testid="capture-promise"
          className="p7-btn p7-btn-primary"
          style={{
            width: "100%",
            minHeight: 56,
            marginBottom: "var(--space-4)",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Capture a promise
        </CaptureLink>
      )}
      <SectionHeader title="Quick Actions" as="h3" />
      <div className="my-day-quick-grid" style={{ marginTop: "var(--space-3)" }}>
        {FIELD_QUICK_ACTIONS.map((act) => (
          <Link
            key={act.label}
            href={act.href as Route}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "var(--space-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              color: "inherit",
              background: "var(--bg-card)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 18 }}>{act.icon}</span>
            <span>{act.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}