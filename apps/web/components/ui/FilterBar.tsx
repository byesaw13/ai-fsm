// ---------------------------------------------------------------------------
// FilterBar — URL-persisted filter bar (GET form, no JS required)
// ---------------------------------------------------------------------------
//
// Pattern 1 from P7_INTERACTION_PATTERNS.md.
// Renders as <form method="GET"> — filters are URL search params.
// Server Component pages read filters from searchParams prop.

import Link from "next/link";
import type { Route } from "next";

export interface FilterDef {
  name: string;
  type: "text" | "select";
  label?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}

interface FilterBarProps {
  filters: FilterDef[];
  baseHref: string;
  activeCount?: number;
  /** Current values read from URL searchParams (for showing active chips) */
  currentValues?: Record<string, string>;
  submitLabel?: string;
}

export function FilterBar({
  filters,
  baseHref,
  currentValues = {},
  submitLabel = "Filter",
}: FilterBarProps) {
  const activeFilters = filters.filter(
    (f) => currentValues[f.name] && currentValues[f.name] !== ""
  );

  return (
    <div className="p7-filter-bar">
      <form method="GET" action={baseHref} className="p7-filter-form">
        {filters.map((f) => (
          <div key={f.name} className="p7-filter-field">
            {f.label && (
              <label htmlFor={`filter-${f.name}`}>{f.label}</label>
            )}
            {f.type === "text" ? (
              <input
                id={`filter-${f.name}`}
                className="p7-input"
                type="text"
                name={f.name}
                placeholder={f.placeholder}
                defaultValue={currentValues[f.name] ?? f.defaultValue ?? ""}
                aria-label={f.label ?? f.name}
              />
            ) : (
              <select
                id={`filter-${f.name}`}
                className="p7-select"
                name={f.name}
                defaultValue={currentValues[f.name] ?? f.defaultValue ?? ""}
                aria-label={f.label ?? f.name}
              >
                <option value="">All</option>
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        <div className="p7-filter-actions">
          <button type="submit" className="p7-btn p7-btn-secondary p7-btn-sm">
            {submitLabel}
          </button>
        </div>
      </form>

      {activeFilters.length > 0 && (
        <div className="p7-filter-active-chips">
          <span>Filtered by: </span>
          {activeFilters.map((f) => (
            <span key={f.name}>
              {f.label ?? f.name}: <strong>{currentValues[f.name]}</strong>
            </span>
          ))}
          {" · "}
          <Link href={baseHref as Route} className="p7-filter-clear-link">
            Clear all
          </Link>
        </div>
      )}
    </div>
  );
}
