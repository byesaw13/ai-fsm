"use client";

// Estimate entry modes. The two dead paths from the old modal — "duplicate"
// (never pre-filled) and "convert booking request" (never pre-filled) — were
// removed because they only opened a blank manual form. See
// Historical estimate-system audit context was removed from the tree; git history retains it.
//
//   quick    → manual form defaulting to flat-rate (the most common Dovetails estimate)
//   detailed → manual form defaulting to itemized line items + price book
//   ai       → conversational AI draft, then the manual form pre-populated
//   tm       → paste freeform briefing → T&M hour/range draft (no price-book force)
export type EstimateMode = "quick" | "detailed" | "ai" | "tm";

type PricingMode = "itemized" | "flat_rate" | "multi_option";

/**
 * Resolve the form's pricing mode from the chosen entry mode.
 * An explicit override (e.g. a ?pricing_mode= URL param) always wins; otherwise
 * Quick → flat-rate (the common default) and Detailed/AI/T&M → itemized.
 */
export function resolveEntryPricingMode(
  mode: EstimateMode,
  override?: PricingMode
): PricingMode {
  if (override) return override;
  return mode === "quick" ? "flat_rate" : "itemized";
}

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
    mode: "quick",
    label: "Quick Estimate",
    description: "One flat price for the job. Fastest path — best for most handyman work.",
    badge: "Recommended",
  },
  {
    mode: "detailed",
    label: "Detailed Estimate",
    description: "Itemized line items with the price book. Use for larger or multi-task projects.",
  },
  {
    mode: "ai",
    label: "AI Estimate",
    description: "Describe the job in your own words. The assistant prices it from the price book.",
  },
  {
    mode: "tm",
    label: "T&M from notes",
    description:
      "Paste a briefing (walkthrough notes or another AI). Builds a time-and-materials estimate with hours, travel, and customer language.",
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
          data-testid={`estimate-mode-${opt.mode}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            background: "var(--bg-surface)",
            border: opt.mode === "quick" ? "2px solid var(--accent)" : "1px solid var(--border)",
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
