import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// DataTable — dense table view for admin (desktop). Hidden on mobile via CSS.
// ---------------------------------------------------------------------------

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
  "data-testid"?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  onRowClick,
  emptyMessage = "No data.",
  className = "",
  "data-testid": testId,
}: DataTableProps<T>) {
  return (
    <div className={`p7-table-wrapper ${className}`} data-testid={testId}>
      <table className="p7-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  textAlign: col.align ?? "left",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{ textAlign: "center", color: "var(--fg-muted)", padding: "var(--space-8)" }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align ?? "left" }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
