"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloseButton({
  businessDayId,
  status,
  closedAt,
  disabled: disabledProp,
  label,
}: {
  businessDayId: string;
  status: string;
  closedAt: string | null;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const isClosed = status === "CLOSED";

  async function act(url: string, body: object) {
    setLoading(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) return false;
    router.refresh();
    return true;
  }

  if (isClosed) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Day closed{closedAt ? ` at ${new Date(closedAt).toLocaleTimeString()}` : ""}.
        </p>
        {!reopening ? (
          <button
            type="button"
            onClick={() => setReopening(true)}
            disabled={loading}
            className="text-sm underline text-muted-foreground disabled:opacity-50"
          >
            Reopen day
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (e.g. emergency call)"
              style={{
                minHeight: 40,
                padding: "0 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={async () => {
                const ok = await act("/api/v1/business-day/transition", {
                  id: businessDayId,
                  to: "REOPENED",
                  reason: reason.trim(),
                });
                if (ok) {
                  setReopening(false);
                  setReason("");
                }
              }}
              disabled={loading || !reason.trim()}
              className="p7-btn p7-btn-secondary p7-btn-sm"
            >
              {loading ? "Opening…" : "Confirm reopen"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => act("/api/v1/day-review/close", { id: businessDayId })}
      disabled={loading || disabledProp}
      className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-base font-medium disabled:opacity-50"
    >
      {loading ? "Closing…" : (label ?? "Close Day")}
    </button>
  );
}