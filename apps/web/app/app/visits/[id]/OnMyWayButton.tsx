"use client";

import { useState } from "react";

interface OnMyWayButtonProps {
  visitId: string;
}

export function OnMyWayButton({ visitId }: OnMyWayButtonProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleClick() {
    setState("sending");
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/on-my-way`, { method: "POST" });
      if (res.ok) {
        setState("sent");
      } else {
        setState("error");
        setTimeout(() => setState("idle"), 3000);
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  if (state === "sent") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--color-success-50, #f0fdf4)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-success-200, #bbf7d0)",
          fontSize: "var(--text-sm)",
          color: "var(--color-success-700, #15803d)",
          fontWeight: 600,
        }}
        data-testid="on-my-way-sent"
      >
        Client notified — on your way!
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "sending"}
      className="p7-btn p7-btn-primary"
      data-testid="on-my-way-btn"
      style={{ width: "100%" }}
    >
      {state === "sending"
        ? "Sending…"
        : state === "error"
          ? "Failed — tap to retry"
          : "On My Way — Notify Client"}
    </button>
  );
}
