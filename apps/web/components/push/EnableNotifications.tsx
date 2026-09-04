"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Enable/disable Web Push on this device (EPIC-005 TASK-118). Subscribes via the
 * Push API and stores the subscription server-side. Permission must be requested
 * on a user gesture; a denied permission can't be re-prompted, so we surface a
 * "blocked" state instead of looping.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Back with a concrete ArrayBuffer so the type is Uint8Array<ArrayBuffer>,
  // which applicationServerKey (BufferSource) accepts.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "unconfigured" | "blocked" | "off" | "on" | "working";

export function EnableNotifications() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!supported) {
      setState("unsupported");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/push/public-key");
        const json = await res.json();
        if (cancelled) return;
        if (!json?.data?.configured) {
          setState("unconfigured");
          return;
        }
        setPublicKey(json.data.publicKey as string);
        if (Notification.permission === "denied") {
          setState("blocked");
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        setState(existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setState("working");
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setState("on");
    } catch {
      setMsg("Couldn't enable notifications — try again.");
      setState("off");
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setState("working");
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/v1/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setMsg("Couldn't turn off — try again.");
      setState("on");
    }
  }, []);

  const sendTest = useCallback(async () => {
    setMsg(null);
    try {
      const res = await fetch("/api/v1/push/test", { method: "POST" });
      setMsg(res.ok ? "Test sent — check your notifications." : "Test failed.");
    } catch {
      setMsg("Test failed.");
    }
  }, []);

  if (state === "loading" || state === "unsupported" || state === "unconfigured") {
    const text =
      state === "unsupported"
        ? "This browser doesn't support notifications. On iPhone, add the app to your Home Screen first."
        : state === "unconfigured"
          ? "Notifications aren't set up on the server yet."
          : "…";
    return <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>{text}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {state === "blocked" ? (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
          Notifications are blocked. Enable them for this site in your browser settings.
        </p>
      ) : state === "on" ? (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "var(--text-sm)" }}>🔔 Notifications on for this device</span>
          <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={sendTest}>Send test</button>
          <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={disable}>Turn off</button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="p7-btn p7-btn-primary p7-btn-sm"
            onClick={enable}
            disabled={state === "working"}
          >
            {state === "working" ? "…" : "Enable notifications"}
          </button>
        </div>
      )}
      {msg && <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: 0 }}>{msg}</p>}
    </div>
  );
}
