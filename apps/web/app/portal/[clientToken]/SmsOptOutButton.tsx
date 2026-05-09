"use client";

import { useState } from "react";

export function SmsOptOutButton({ clientToken }: { clientToken: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleOptOut() {
    setState("loading");
    try {
      const res = await fetch(`/api/portal/${clientToken}/sms-opt-out`, { method: "POST" });
      if (res.ok) {
        setState("done");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span style={{ fontSize: 13, color: "#065f46" }}>
        You have been opted out of SMS messages.
      </span>
    );
  }

  return (
    <button
      onClick={handleOptOut}
      disabled={state === "loading"}
      style={{
        fontSize: 13,
        color: "#dc2626",
        background: "none",
        border: "1px solid #fca5a5",
        borderRadius: 6,
        padding: "4px 12px",
        cursor: state === "loading" ? "not-allowed" : "pointer",
        opacity: state === "loading" ? 0.6 : 1,
      }}
    >
      {state === "loading" ? "Processing…" : "Opt out of SMS"}
      {state === "error" && <span style={{ marginLeft: 8, color: "#dc2626" }}>Error — please try again.</span>}
    </button>
  );
}
