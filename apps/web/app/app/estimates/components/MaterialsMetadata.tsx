// Owner-facing display of the materials generator's metadata: what the
// estimator assumed, what measurements are missing, and which customer-supplied
// items were deliberately left off the purchase list (TASK-018).
//
// Purely presentational — it never mutates the generated/owner-edited lines.

export interface MaterialsMetadata {
  assumptions?: string[];
  missing_measurements?: string[];
  excluded_customer_supplied_items?: string[];
}

type Tone = "neutral" | "warning" | "info";

export interface MetadataSection {
  key: keyof MaterialsMetadata;
  title: string;
  tone: Tone;
  items: string[];
}

/**
 * Pure: pick the non-empty metadata groups, in display order. Empty groups are
 * dropped so they never render. Drives the component below and is unit-tested.
 */
export function buildMetadataSections(meta: MaterialsMetadata | null | undefined): MetadataSection[] {
  if (!meta) return [];
  const clean = (v: string[] | undefined): string[] =>
    (v ?? []).map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);

  const defs: MetadataSection[] = [
    { key: "missing_measurements", title: "Missing measurements", tone: "warning", items: clean(meta.missing_measurements) },
    { key: "assumptions", title: "Assumptions", tone: "neutral", items: clean(meta.assumptions) },
    { key: "excluded_customer_supplied_items", title: "Excluded — customer-supplied", tone: "info", items: clean(meta.excluded_customer_supplied_items) },
  ];
  return defs.filter((s) => s.items.length > 0);
}

const TONE_STYLE: Record<Tone, { border: string; bg: string; label: string }> = {
  warning: { border: "var(--color-warning, #b45309)", bg: "rgba(180,83,9,0.08)", label: "var(--color-warning, #b45309)" },
  neutral: { border: "var(--color-border)", bg: "var(--surface-2, rgba(0,0,0,0.03))", label: "var(--fg-secondary)" },
  info: { border: "#0891b2", bg: "rgba(8,145,178,0.08)", label: "#0891b2" },
};

export function MaterialsMetadata({ metadata }: { metadata: MaterialsMetadata | null | undefined }) {
  const sections = buildMetadataSections(metadata);
  if (sections.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
      {sections.map((s) => {
        const tone = TONE_STYLE[s.tone];
        return (
          <div
            key={s.key}
            style={{
              border: `1px solid ${tone.border}`,
              background: tone.bg,
              borderRadius: "var(--radius-md)",
              padding: "var(--space-2) var(--space-3)",
            }}
          >
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: tone.label, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {s.title}
            </div>
            <ul style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--fg-primary)" }}>
              {s.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
