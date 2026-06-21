"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export interface SquareStatus {
  configured: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  locationId: string | null;
  applicationId: string | null;
  hasAccessToken: boolean;
  hasWebhookSignatureKey: boolean;
  status: "disconnected" | "connected" | "error";
  statusDetail: string | null;
  lastCheckedAt: string | null;
  encryptionConfigured: boolean;
}

interface Props {
  initial: SquareStatus;
}

const STATUS_COLOR: Record<SquareStatus["status"], string> = {
  connected: "var(--color-success, green)",
  error: "var(--color-danger, red)",
  disconnected: "var(--fg-muted)",
};

export function SquarePanel({ initial }: Props) {
  const { success, error } = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [environment, setEnvironment] = useState(initial.environment);
  const [locationId, setLocationId] = useState(initial.locationId ?? "");
  const [applicationId, setApplicationId] = useState(
    initial.applicationId ?? ""
  );
  const [accessToken, setAccessToken] = useState("");
  const [webhookSignatureKey, setWebhookSignatureKey] = useState("");
  const [hasAccessToken, setHasAccessToken] = useState(initial.hasAccessToken);
  const [hasWebhookKey, setHasWebhookKey] = useState(
    initial.hasWebhookSignatureKey
  );
  const [status, setStatus] = useState(initial.status);
  const [statusDetail, setStatusDetail] = useState(initial.statusDetail);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/integrations/square", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          environment,
          locationId: locationId.trim() || null,
          applicationId: applicationId.trim() || null,
          // only send secrets when the user typed a new value
          accessToken: accessToken.trim() || undefined,
          webhookSignatureKey: webhookSignatureKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error?.message ?? "Save failed");
        return;
      }
      if (accessToken.trim()) setHasAccessToken(true);
      if (webhookSignatureKey.trim()) setHasWebhookKey(true);
      setAccessToken("");
      setWebhookSignatureKey("");
      setStatus("disconnected");
      setStatusDetail(null);
      success("Square settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/v1/integrations/square/test", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error?.message ?? "Connection test failed");
        return;
      }
      const ok = data.data?.ok as boolean;
      setStatus(ok ? "connected" : "error");
      setStatusDetail(data.data?.detail ?? null);
      if (ok) success("Square connected");
      else error(data.data?.detail ?? "Square connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
      data-testid="square-settings-form"
    >
      {!initial.encryptionConfigured && (
        <p className="error-inline" role="alert">
          APP_ENCRYPTION_KEY is not configured on the server — Square secrets
          cannot be stored until it is set.
        </p>
      )}

      <div
        style={{ display: "flex", alignItems: "center", gap: 8 }}
        data-testid="square-status"
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: STATUS_COLOR[status],
            display: "inline-block",
          }}
        />
        <strong style={{ fontSize: "var(--text-sm)" }}>
          {status === "connected"
            ? "Connected"
            : status === "error"
              ? "Connection error"
              : "Disconnected"}
        </strong>
        {statusDetail && (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            — {statusDetail}
          </span>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          data-testid="square-enabled"
        />
        Enable Square card payments
      </label>

      <div className="form-group">
        <label htmlFor="square-environment">Environment</label>
        <select
          id="square-environment"
          value={environment}
          onChange={(e) =>
            setEnvironment(e.target.value as "sandbox" | "production")
          }
        >
          <option value="sandbox">Sandbox</option>
          <option value="production">Production</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="square-location">Location ID</label>
        <input
          id="square-location"
          type="text"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          maxLength={64}
          placeholder="e.g. L1A2B3C4D5E6F"
        />
      </div>

      <div className="form-group">
        <label htmlFor="square-application">Application ID</label>
        <input
          id="square-application"
          type="text"
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
          maxLength={128}
          placeholder="e.g. sandbox-sq0idb-…"
        />
      </div>

      <div className="form-group">
        <label htmlFor="square-token">
          Access Token{" "}
          {hasAccessToken && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              (saved — leave blank to keep)
            </span>
          )}
        </label>
        <input
          id="square-token"
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          autoComplete="off"
          maxLength={512}
          placeholder={hasAccessToken ? "••••••••" : "Square access token"}
        />
      </div>

      <div className="form-group">
        <label htmlFor="square-webhook-key">
          Webhook Signature Key{" "}
          {hasWebhookKey && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              (saved — leave blank to keep)
            </span>
          )}
        </label>
        <input
          id="square-webhook-key"
          type="password"
          value={webhookSignatureKey}
          onChange={(e) => setWebhookSignatureKey(e.target.value)}
          autoComplete="off"
          maxLength={512}
          placeholder={hasWebhookKey ? "••••••••" : "Square webhook signature key"}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !initial.encryptionConfigured}
        >
          {saving ? "Saving…" : "Save Square settings"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={testing || !hasAccessToken}
          data-testid="square-test"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>
    </form>
  );
}
