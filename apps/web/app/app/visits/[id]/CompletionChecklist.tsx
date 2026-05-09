"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@/components/ui";
import { checkCompletionPacket } from "@/lib/completion-guard";

type CompletionPacketValues = {
  photo_urls: string[];
  signature_url: string | null;
  signature_waiver: boolean;
  notes: string | null;
};

interface CompletionChecklistProps {
  visitId: string;
  initialPacket: CompletionPacketValues | null;
  canUpdate: boolean;
  canComplete: boolean;
}

const ERROR_LABELS: Record<string, string> = {
  MISSING_PHOTO: "Add at least one completion photo URL.",
  MISSING_SIGNATURE: "Add a signature URL or mark the signature as waived.",
};

export function CompletionChecklist({
  visitId,
  initialPacket,
  canUpdate,
  canComplete,
}: CompletionChecklistProps) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [photoUrlsText, setPhotoUrlsText] = useState((initialPacket?.photo_urls ?? []).join("\n"));
  const [signatureUrl, setSignatureUrl] = useState(initialPacket?.signature_url ?? "");
  const [signatureWaiver, setSignatureWaiver] = useState(initialPacket?.signature_waiver ?? false);
  const [notes, setNotes] = useState(initialPacket?.notes ?? "");

  const photoUrls = useMemo(
    () => photoUrlsText.split(/\r?\n|,/).map((url) => url.trim()).filter(Boolean),
    [photoUrlsText]
  );
  const guard = checkCompletionPacket({
    photo_urls: photoUrls,
    signature_url: signatureUrl.trim() || null,
    signature_waiver: signatureWaiver,
  });
  const missingMessage = guard.ok ? null : ERROR_LABELS[guard.error ?? ""] ?? "Completion packet is incomplete.";
  const signatureStatus = signatureWaiver ? "waived" : signatureUrl.trim() ? "captured" : "missing";

  async function savePacket() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/completion-packet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_urls: photoUrls,
          signature_url: signatureUrl.trim() || null,
          signature_waiver: signatureWaiver,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to save completion packet");
        return false;
      }
      toast.success("Completion packet saved");
      router.refresh();
      return true;
    } catch {
      toast.error("Unexpected error saving completion packet");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function markComplete() {
    if (!guard.ok) return;
    setCompleting(true);
    try {
      const saved = await savePacket();
      if (!saved) return;
      const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = typeof data.error === "string" ? data.error : data.error?.message;
        toast.error(error ?? "Could not complete visit");
        return;
      }
      toast.success("Visit completed");
      router.refresh();
    } catch {
      toast.error("Unexpected error completing visit");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="p7-form-stack" data-testid="completion-checklist">
      <dl className="p7-detail-list">
        <div className="p7-detail-row">
          <dt>Photos</dt>
          <dd>{photoUrls.length > 0 ? `${photoUrls.length} added` : "none"}</dd>
        </div>
        <div className="p7-detail-row">
          <dt>Signature</dt>
          <dd>{signatureStatus}</dd>
        </div>
      </dl>

      <Textarea
        id="completion-photo-urls"
        label="Photo URLs"
        value={photoUrlsText}
        onChange={(event) => setPhotoUrlsText(event.target.value)}
        disabled={!canUpdate || saving || completing}
        rows={3}
        hint="One URL per line, or comma-separated."
      />

      <Textarea
        id="completion-notes"
        label="Completion Notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={!canUpdate || saving || completing}
        rows={3}
      />

      <label className="p7-field">
        <span className="p7-label">Signature URL</span>
        <input
          className="p7-input"
          type="url"
          value={signatureUrl}
          onChange={(event) => setSignatureUrl(event.target.value)}
          disabled={!canUpdate || signatureWaiver || saving || completing}
          placeholder="https://example.com/signature.png"
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <input
          type="checkbox"
          checked={signatureWaiver}
          onChange={(event) => setSignatureWaiver(event.target.checked)}
          disabled={!canUpdate || saving || completing}
        />
        <span style={{ fontSize: "var(--text-sm)" }}>Client signature waived</span>
      </label>

      {missingMessage && (
        <p className="warning-inline" style={{ margin: 0 }}>
          {missingMessage}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="secondary"
          onClick={savePacket}
          disabled={!canUpdate || saving || completing}
        >
          {saving ? "Saving..." : "Save Packet"}
        </Button>
        <Button
          type="button"
          onClick={markComplete}
          disabled={!canComplete || !guard.ok || saving || completing}
          title={!guard.ok ? missingMessage ?? undefined : undefined}
          data-testid="completion-mark-complete"
        >
          {completing ? "Completing..." : "Mark Complete"}
        </Button>
      </div>
    </div>
  );
}
