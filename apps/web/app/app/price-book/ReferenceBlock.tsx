import {
  parseReferenceHours,
  referenceSwapHours,
  type ReferenceHoursEntry,
} from "@ai-fsm/domain";

/** The price book fields the Craftsman reference block reads (TASK-218). Display only. */
export interface ReferenceService {
  default_labor_hours: number | null;
  labor_hours_low: number | null;
  labor_hours_typical: number | null;
  labor_hours_high: number | null;
  reference_hours: unknown;
}

function formatHours(h: number): string {
  return Number(h.toFixed(3)).toString();
}

function ourHoursLabel(s: ReferenceService): string {
  const parts = [s.labor_hours_low, s.labor_hours_typical, s.labor_hours_high];
  if (parts.every((h) => h === null)) return s.default_labor_hours !== null ? `${s.default_labor_hours} h` : "—";
  return `${parts.map((h) => (h === null ? "—" : formatHours(h))).join(" / ")} h (low / typical / high)`;
}

function ReferenceLine({ entry }: { entry: ReferenceHoursEntry }) {
  const perUnit = entry.unit === "Ea" ? "each" : `per ${entry.unit}`;
  const swap = referenceSwapHours(entry);
  return (
    <li style={{ marginBottom: "var(--space-1)" }}>
      <span style={{ fontWeight: 600 }}>{entry.line}</span>
      <span style={{ color: "var(--fg-muted)" }}> · {entry.book}{entry.edition ? ` (${entry.edition})` : ""}</span>
      <div>
        Install {formatHours(entry.install_hours)} h {perUnit}
        {entry.remove_hours !== undefined && (
          <> · remove {formatHours(entry.remove_hours)} h · swap {formatHours(swap.swap)} h {perUnit}</>
        )}
        {entry.reset_hours !== undefined && <> · pull and reset {formatHours(entry.reset_hours)} h</>}
        {entry.minimum_hours !== undefined && <> · trade minimum {formatHours(entry.minimum_hours)} h</>}
      </div>
      {entry.includes && <div style={{ color: "var(--fg-muted)" }}>Includes: {entry.includes}</div>}
      {entry.note && <div style={{ color: "var(--fg-muted)", fontStyle: "italic" }}>{entry.note}</div>}
    </li>
  );
}

export function ReferenceBlock({ service }: { service: ReferenceService }) {
  const entries = parseReferenceHours(service.reference_hours);
  if (entries.length === 0) return null;
  const captured = [...new Set(entries.map((e) => e.captured_on))].sort().join(", ");
  return (
    <div
      data-testid="price-book-reference"
      style={{
        marginTop: "var(--space-3)",
        padding: "var(--space-2) var(--space-3)",
        borderLeft: "3px solid var(--border)",
        background: "var(--bg-subtle, transparent)",
      }}
    >
      <div style={{ fontWeight: 600 }}>Reference (Craftsman)</div>
      <p style={{ margin: "0 0 var(--space-2)", color: "var(--fg-muted)" }}>
        Reference only. Your hours are used on quotes. Your hours: {ourHoursLabel(service)}. Craftsman hours are
        worker-hours per unit, without travel or setup. Captured {captured}.
      </p>
      <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
        {entries.map((e, i) => (
          <ReferenceLine key={`${e.book}-${e.line}-${i}`} entry={e} />
        ))}
      </ul>
    </div>
  );
}
