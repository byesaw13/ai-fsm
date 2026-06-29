"use client";

export type ConditionLevel = "good" | "fair" | "poor" | "critical" | "not_assessed";

export type ConditionRow = {
  area: string;
  condition: ConditionLevel;
  note: string | null;
  assessed_at: string;
  visit_id: string;
  trend: { condition: ConditionLevel; assessed_at: string }[];
};

const CONDITION_COLOR: Record<ConditionLevel, { fg: string; bg: string; label: string }> = {
  good:         { fg: "var(--status-completed-fg)", bg: "var(--status-completed-bg)", label: "Good" },
  fair:         { fg: "var(--priority-high-fg)", bg: "var(--priority-high-bg)", label: "Fair" },
  poor:         { fg: "var(--color-red-600)", bg: "var(--color-red-100)", label: "Poor" },
  critical:     { fg: "var(--priority-urgent-fg)", bg: "var(--priority-urgent-bg)", label: "Critical" },
  not_assessed: { fg: "var(--status-draft-fg)", bg: "var(--status-draft-bg)", label: "—" },
};

const TREND_DOT: Record<ConditionLevel, string> = {
  good:         "var(--status-completed-fg)",
  fair:         "var(--priority-high-fg)",
  poor:         "var(--color-red-600)",
  critical:     "var(--priority-urgent-fg)",
  not_assessed: "var(--color-slate-400)",
};

function ConditionBadge({ condition }: { condition: ConditionLevel }) {
  const c = CONDITION_COLOR[condition];
  return (
    <span
      style={{
        display: "inline-block",
        background: c.bg,
        color: c.fg,
        borderRadius: 99,
        padding: "2px 10px",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
      }}
    >
      {c.label}
    </span>
  );
}

function TrendDots({ trend }: { trend: { condition: ConditionLevel }[] }) {
  if (trend.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[...trend].reverse().map((t, i) => (
        <div
          key={i}
          title={CONDITION_COLOR[t.condition].label}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: TREND_DOT[t.condition],
            opacity: 1 - i * 0.25,
          }}
        />
      ))}
    </div>
  );
}

export function PropertyConditionsPanel({ conditions }: { conditions: ConditionRow[] }) {
  if (conditions.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", padding: "var(--space-2) 0" }}>
        No conditions recorded yet. Conditions are captured automatically when visits are completed.
      </p>
    );
  }

  const sorted = [...conditions].sort((a, b) => {
    const order: ConditionLevel[] = ["critical", "poor", "fair", "good", "not_assessed"];
    return order.indexOf(a.condition) - order.indexOf(b.condition);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      {sorted.map((row) => (
        <div
          key={row.area}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-subtle)",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: 2 }}>{row.area}</div>
            {row.note && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                {row.note}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
            <TrendDots trend={row.trend} />
            <ConditionBadge condition={row.condition} />
          </div>
        </div>
      ))}
    </div>
  );
}
