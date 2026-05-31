"use client";

export type EstimateMode = "ai" | "manual" | "duplicate" | "convert";

interface EstimateLaunchModalProps {
  onSelect: (mode: EstimateMode) => void;
}

const OPTIONS: Array<{
  mode: EstimateMode;
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    mode: "ai",
    label: "AI Guided Estimate",
    description: "Describe the project — the AI asks what it needs, then generates a complete draft.",
    badge: "Recommended",
  },
  {
    mode: "manual",
    label: "Manual Estimate Builder",
    description: "Use the step-by-step form to build the estimate yourself.",
  },
  {
    mode: "duplicate",
    label: "Duplicate Existing Estimate",
    description: "Copy a previous estimate as a starting point.",
  },
  {
    mode: "convert",
    label: "Convert Booking Request",
    description: "Start from an existing lead or intake form.",
  },
];

export function EstimateLaunchModal({ onSelect }: EstimateLaunchModalProps) {
  return (
    <div style={{
      maxWidth: 560,
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
    }}>
      <div style={{ textAlign: "center", marginBottom: "var(--space-2)" }}>
        <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xl)", fontWeight: 700 }}>
          New Estimate
        </h2>
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          How would you like to build this estimate?
        </p>
      </div>

      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          onClick={() => onSelect(opt.mode)}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            background: "var(--bg-surface)",
            border: opt.mode === "ai" ? "2px solid var(--accent)" : "1px solid var(--border)",
            borderRadius: "var(--radius)",
            cursor: "pointer",
            textAlign: "left",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 3px var(--accent)22";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "";
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{opt.label}</span>
              {opt.badge && (
                <span style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  padding: "1px 7px",
                  borderRadius: 99,
                  background: "var(--accent)",
                  color: "#fff",
                }}>
                  {opt.badge}
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: 1.5 }}>
              {opt.description}
            </p>
          </div>
          <span style={{ fontSize: "var(--text-lg)", color: "var(--fg-muted)", flexShrink: 0, marginTop: 2 }}>→</span>
        </button>
      ))}
    </div>
  );
}
