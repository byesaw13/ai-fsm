"use client";

import { useState } from "react";

export default function PortalLogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await fetch("/api/v1/portal/logout", { method: "POST" });
    window.location.href = "/portal/login";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      style={{
        background: "none",
        border: "1px solid #d1d5db",
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 13,
        color: "#6b7280",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "…" : "Sign out"}
    </button>
  );
}
