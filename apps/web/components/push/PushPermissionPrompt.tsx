"use client";

import { useCallback, useEffect, useState } from "react";

/** One-time My Work Web Push prompt. Dismiss is sticky across reloads. */
export const PUSH_PROMPT_STORAGE_KEY = "dovetails.push.prompted";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function shouldShowPushPrompt({
  permission,
  prompted,
  configured,
  hasSubscription,
  supported,
}: {
  permission: string;
  prompted: boolean;
  configured: boolean;
  hasSubscription: boolean;
  supported: boolean;
}): boolean {
  return (
    supported &&
    permission === "default" &&
    !prompted &&
    configured &&
    !hasSubscription
  );
}

export function dismissPushPrompt(
  storage: { setItem(key: string, value: string): void } = globalThis.localStorage,
): void {
  storage.setItem(PUSH_PROMPT_STORAGE_KEY, "1");
}

function isPrompted(): boolean {
  try {
    return localStorage.getItem(PUSH_PROMPT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function PushPermissionPrompt({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    const supported = isPushSupported();
    // Skip network until permission/support/dismiss could actually show the card.
    if (!supported || Notification.permission !== "default" || isPrompted()) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/push/public-key");
        const json = await res.json();
        if (cancelled) return;
        const configured = Boolean(json?.data?.configured);
        const key = (json?.data?.publicKey as string | undefined) ?? null;
        if (!configured || !key) {
          setVisible(false);
          return;
        }
        setPublicKey(key);
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        if (cancelled) return;
        setVisible(
          shouldShowPushPrompt({
            permission: Notification.permission,
            prompted: isPrompted(),
            configured: true,
            hasSubscription: Boolean(existing),
            supported: true,
          }),
        );
      } catch {
        if (!cancelled) setVisible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
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
      setVisible(false);
    } catch {
      // Stay visible so a network/subscribe failure can be retried.
    } finally {
      setWorking(false);
    }
  }, [publicKey]);

  const dismiss = useCallback(() => {
    dismissPushPrompt();
    setVisible(false);
  }, []);

  if (!enabled || !visible) return null;

  return (
    <div
      data-testid="push-permission-prompt"
      style={{
        marginBottom: "var(--space-4)",
        padding: "var(--space-3)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        fontSize: "var(--text-sm)",
      }}
    >
      <p style={{ margin: "0 0 var(--space-2)" }}>
        Get start-day and on-site alerts on this phone
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <button
          type="button"
          className="p7-btn p7-btn-primary p7-btn-sm"
          onClick={enable}
          disabled={working}
        >
          {working ? "…" : "Enable"}
        </button>
        <button
          type="button"
          className="p7-btn p7-btn-ghost p7-btn-sm"
          onClick={dismiss}
          disabled={working}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
