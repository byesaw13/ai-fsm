"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RevisionSummary } from "@/lib/expenses/receipt-revisions";

const ORIGIN_TEXT: Record<RevisionSummary["origin"], string> = {
  parse: "read from the photo",
  edit: "edited",
  restore: "restored",
};

/**
 * Receipt versions (TASK-211): each read or edit of the lines is a version. The
 * current one's prices count; an earlier one can be made current again.
 */
export function ReceiptVersions({
  expenseId,
  current,
  revisions,
  canEdit,
}: {
  expenseId: string;
  current: number;
  revisions: RevisionSummary[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = revisions.find((r) => r.revision === current);
  if (!now) return null;

  async function restore(revision: number) {
    setBusy(revision);
    setError(null);
    try {
      const res = await fetch(`/api/v1/expenses/${expenseId}/parse-revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.message ?? "Could not restore that version");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  const earlier = revisions.filter((r) => r.revision !== current);
  return (
    <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }} data-testid="receipt-versions">
      <p style={{ margin: 0, color: now.balanced === false ? "var(--status-warning, #b45309)" : "var(--fg-muted)" }}>
        Version {current}
        {now.balanced === true && " · adds up to the receipt total"}
        {now.balanced === false && " · does not add up to the receipt total after tax, discounts and returns; its prices count as less certain until it does"}
      </p>
      {earlier.length > 0 && (
        <details style={{ marginTop: "var(--space-2)" }}>
          <summary>Earlier versions ({earlier.length})</summary>
          <ul style={{ listStyle: "none", margin: "var(--space-2) 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {earlier.map((r) => (
              <li key={r.revision} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ flex: 1 }}>
                  Version {r.revision}: {r.line_count} line{r.line_count === 1 ? "" : "s"}, {ORIGIN_TEXT[r.origin]} {r.created_at.slice(0, 10)}
                </span>
                {canEdit && (
                  <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={busy !== null} onClick={() => restore(r.revision)}>
                    {busy === r.revision ? "Restoring…" : "Restore"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p style={{ margin: "var(--space-2) 0 0", color: "var(--status-danger, #dc2626)" }}>{error}</p>}
    </div>
  );
}
