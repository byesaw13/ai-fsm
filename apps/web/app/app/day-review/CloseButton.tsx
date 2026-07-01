"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloseButton({
  businessDayId,
  status,
  closedAt,
}: {
  businessDayId: string;
  status: string;
  closedAt: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isClosed = status === "CLOSED";

  async function act(url: string, body: object) {
    setLoading(true);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    router.refresh();
  }

  if (isClosed) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Day closed{closedAt ? ` at ${new Date(closedAt).toLocaleTimeString()}` : ""}.
        </p>
        <button
          onClick={() => act("/api/v1/business-day/transition", { id: businessDayId, to: "REOPENED", reason: "Post-close edit" })}
          disabled={loading}
          className="text-sm underline text-muted-foreground disabled:opacity-50"
        >
          {loading ? "Opening…" : "Tap to reopen"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => act("/api/v1/day-review/close", { id: businessDayId })}
      disabled={loading}
      className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-base font-medium disabled:opacity-50"
    >
      {loading ? "Closing…" : "Close Day"}
    </button>
  );
}
