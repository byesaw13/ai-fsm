import type { VisitChecklistItem, ChecklistDisposition } from "@ai-fsm/domain";
import { FixNowEstimateButton } from "./FixNowEstimateButton";

interface Props {
  checklistItems: VisitChecklistItem[];
  techNotes: string | null;
  jobId?: string | null;
  clientId?: string | null;
  propertyId?: string | null;
  canCreateEstimate?: boolean;
  visitDate?: string;
}

interface Section {
  label: string;
  disposition: ChecklistDisposition;
  testId: string;
}

const SNAPSHOT_SECTIONS: Section[] = [
  { label: "Fix Now", disposition: "fix_now", testId: "snapshot-fix-now" },
  { label: "Monitor", disposition: "monitor", testId: "snapshot-monitor" },
  { label: "Optional Improvements", disposition: "optional", testId: "snapshot-optional" },
  { label: "Refer to Trade", disposition: "refer", testId: "snapshot-refer" },
];

const BADGE_CLASS: Record<ChecklistDisposition, string> = {
  ok: "p7-badge p7-badge-status-completed",
  fix_now: "p7-badge p7-badge-status-overdue",
  monitor: "p7-badge p7-badge-status-quoted",
  optional: "p7-badge p7-badge-status-draft",
  refer: "p7-badge p7-badge-status-cancelled",
};

function ItemList({ items }: { items: VisitChecklistItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      {items.map((item) => (
        <li
          key={item.id}
          style={{
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>{item.label}</span>
          {item.note && (
            <p
              style={{
                marginTop: "var(--space-1)",
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-secondary)",
              }}
            >
              {item.note}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function VisitSnapshotPanel({
  checklistItems,
  techNotes,
  jobId,
  clientId,
  propertyId,
  canCreateEstimate,
  visitDate,
}: Props) {
  const completedItems = checklistItems.filter((i) => i.disposition === "ok");
  const unreviewed = checklistItems.filter((i) => !i.disposition);
  const showEstimateButton = !!(canCreateEstimate && clientId && jobId && visitDate);

  return (
    <div data-testid="visit-snapshot-panel">
      {/* Work completed */}
      {completedItems.length > 0 && (
        <div data-testid="snapshot-completed" style={{ marginBottom: "var(--space-5)" }}>
          <h3
            style={{
              fontWeight: 600,
              fontSize: "var(--font-size-sm)",
              color: "var(--color-success)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "var(--space-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <span className={BADGE_CLASS.ok}>OK</span>
            Work Completed
            <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>
              ({completedItems.length})
            </span>
          </h3>
          <ItemList items={completedItems} />
        </div>
      )}

      {/* Fix Now / Monitor / Optional / Refer sections */}
      {SNAPSHOT_SECTIONS.map(({ label, disposition, testId }) => {
        const items = checklistItems.filter((i) => i.disposition === disposition);
        if (items.length === 0) return null;
        return (
          <div key={disposition} data-testid={testId} style={{ marginBottom: "var(--space-5)" }}>
            <h3
              style={{
                fontWeight: 600,
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "var(--space-3)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <span className={BADGE_CLASS[disposition]}>{label}</span>
              <span style={{ fontWeight: 400 }}>({items.length})</span>
            </h3>

            {/* Fix Now items get a Create Estimate button for owner/admin */}
            {disposition === "fix_now" && showEstimateButton ? (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {items.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "var(--space-3)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>
                        {item.label}
                      </span>
                      {item.note && (
                        <p
                          style={{
                            marginTop: "var(--space-1)",
                            fontSize: "var(--font-size-sm)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {item.note}
                        </p>
                      )}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <FixNowEstimateButton
                        label={item.label}
                        note={item.note ?? null}
                        jobId={jobId!}
                        clientId={clientId!}
                        propertyId={propertyId ?? null}
                        visitDate={visitDate!}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ItemList items={items} />
            )}
          </div>
        );
      })}

      {/* Tech notes */}
      {techNotes && (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <h3
            style={{
              fontWeight: 600,
              fontSize: "var(--font-size-sm)",
              color: "var(--color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "var(--space-3)",
            }}
          >
            Tech Notes
          </h3>
          <p style={{ fontSize: "var(--font-size-sm)", whiteSpace: "pre-wrap" }}>{techNotes}</p>
        </div>
      )}

      {/* Unreviewed warning */}
      {unreviewed.length > 0 && (
        <p
          data-testid="snapshot-unreviewed-warning"
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-warning, #b45309)",
            marginTop: "var(--space-2)",
          }}
        >
          {unreviewed.length} item{unreviewed.length !== 1 ? "s" : ""} not yet reviewed.
        </p>
      )}

      {checklistItems.length === 0 && (
        <p
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          No checklist items recorded.
        </p>
      )}
    </div>
  );
}
