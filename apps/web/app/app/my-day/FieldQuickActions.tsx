import Link from "next/link";
import type { Route } from "next";
import { SectionHeader } from "@/components/ui";
import { CaptureLink } from "@/components/CaptureLink";
import { QuickBookButton } from "@/components/jobs/QuickBookButton";
import { FIELD_QUICK_ACTIONS } from "@/lib/navigation/quick-actions";

export function FieldQuickActions({
  showCapture = false,
  canQuickBook = false,
}: {
  showCapture?: boolean;
  canQuickBook?: boolean;
}) {
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
        {FIELD_QUICK_ACTIONS.filter((act) => act.action !== "quick-book" || canQuickBook).map((act) => {
          const tileStyle = {
            display: "flex" as const,
            flexDirection: "column" as const,
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
            textAlign: "center" as const,
            width: "100%",
          };
          const inner = (
            <>
              <span style={{ fontSize: 18 }}>{act.icon}</span>
              <span>{act.label}</span>
            </>
          );
          if (act.action === "quick-book") {
            return (
              <QuickBookButton key={act.label} style={tileStyle} testId="quick-job-launch">
                {inner}
              </QuickBookButton>
            );
          }
          return (
            <Link key={act.label} href={act.href as Route} style={tileStyle}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}