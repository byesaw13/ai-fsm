"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@/components/ui";
import { checkCompletionPacket } from "@/lib/completion-guard";

type CompletionPacketValues = {
  photo_urls: string[];
  signature_url: string | null;
  signature_waiver: boolean;
  notes: string | null;
  photos_waived?: boolean;
  photos_waiver_reason?: string | null;
};

interface CompletionChecklistProps {
  visitId: string;
  initialPacket: CompletionPacketValues | null;
  canUpdate: boolean;
  canComplete: boolean;
  closePhotosItemId?: string;
}

type CompletionPhotoEntry = {
  url: string;
  label: string;
  mediaId: string | null;
};

const ERROR_LABELS: Record<string, string> = {
  MISSING_PHOTO: "Upload at least one completion photo.",
  MISSING_SIGNATURE: "Add a signature URL or mark the signature as waived.",
};

function photoLabelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname;
  } catch {
    return url;
  }
}

export function CompletionChecklist({
  visitId,
  initialPacket,
  canUpdate,
  canComplete,
  closePhotosItemId,
}: CompletionChecklistProps) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [removingPhotoId, setRemovingPhotoId] = useState<string | null>(null);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState("");
  const [photoEntries, setPhotoEntries] = useState<CompletionPhotoEntry[]>(
    () =>
      (initialPacket?.photo_urls ?? []).map((url) => ({
        url,
        label: photoLabelFromUrl(url),
        mediaId: null,
      }))
  );
  const [signatureUrl, setSignatureUrl] = useState(initialPacket?.signature_url ?? "");
  const [signatureWaiver, setSignatureWaiver] = useState(initialPacket?.signature_waiver ?? false);
  const [notes, setNotes] = useState(initialPacket?.notes ?? "");
  const [photosWaived, setPhotosWaived] = useState(initialPacket?.photos_waived ?? false);
  const [photosWaiverReason, setPhotosWaiverReason] = useState(initialPacket?.photos_waiver_reason ?? "");

  const photoUrls = useMemo(() => photoEntries.map((entry) => entry.url).filter(Boolean), [photoEntries]);

  // Clear waiver automatically if photos are uploaded (photos take precedence)
  useEffect(() => {
    if (photoUrls.length > 0 && photosWaived) {
      setPhotosWaived(false);
      setPhotosWaiverReason("");
    }
  }, [photoUrls.length, photosWaived]);

  const guard = checkCompletionPacket({
    photo_urls: photoUrls,
    signature_url: signatureUrl.trim() || null,
    signature_waiver: signatureWaiver,
    photos_waived: photosWaived,
    photos_waiver_reason: photosWaived ? photosWaiverReason : null,
  });
  const missingMessage = guard.ok ? null : ERROR_LABELS[guard.error ?? ""] ?? "Completion packet is incomplete.";
  const signatureStatus = signatureWaiver ? "waived" : signatureUrl.trim() ? "captured" : "missing";

  // Returns an error message, or null on success.
  async function uploadPhoto(file: File): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "after");

      const res = await fetch(`/api/v1/visits/${visitId}/media`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return data.error?.message ?? "Photo upload failed";
      }

      const mediaId = data.data?.id as string | undefined;
      const originalName = data.data?.original_name as string | undefined;
      if (!mediaId) {
        return "Photo upload failed";
      }

      setPhotoEntries((prev) => [
        ...prev,
        {
          url: `/api/v1/visits/${visitId}/media/${mediaId}/image`,
          label: originalName ?? file.name,
          mediaId,
        },
      ]);
      // If waiver was active, uploading a photo clears it (photos take precedence)
      setPhotosWaived(false);
      setPhotosWaiverReason("");
      return null;
    } catch {
      return "Photo upload failed";
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setUploadingPhoto(true);
    const failures: string[] = [];
    let lastErrorMessage: string | null = null;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(files.length > 1 ? `${i + 1} of ${files.length}` : null);
        const errorMessage = await uploadPhoto(files[i]);
        if (errorMessage) {
          failures.push(files[i].name);
          lastErrorMessage = errorMessage;
        }
      }
      const uploaded = files.length - failures.length;
      if (uploaded > 0) {
        router.refresh();
        toast.success(uploaded === 1 ? "Photo uploaded" : `${uploaded} photos uploaded`);
      }
      if (failures.length > 0) {
        toast.error(
          files.length === 1
            ? lastErrorMessage ?? "Photo upload failed"
            : `${failures.length} of ${files.length} photos failed to upload (${failures.join(", ")})`
        );
      }
    } finally {
      setUploadingPhoto(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function addPhotoUrl() {
    const url = draftPhotoUrl.trim();
    if (!url) return;

    try {
      void new URL(url);
    } catch {
      toast.error("Enter a valid photo URL");
      return;
    }

    setPhotoEntries((prev) => [...prev, { url, label: photoLabelFromUrl(url), mediaId: null }]);
    setDraftPhotoUrl("");
    // If waiver was active, adding a photo by URL clears it (photos take precedence)
    setPhotosWaived(false);
    setPhotosWaiverReason("");
  }

  async function removePhoto(entry: CompletionPhotoEntry) {
    if (!entry.mediaId) {
      setPhotoEntries((prev) => prev.filter((photo) => photo.url !== entry.url));
      return;
    }

    setRemovingPhotoId(entry.mediaId);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/media/${entry.mediaId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to remove photo");
        return;
      }

      setPhotoEntries((prev) => prev.filter((photo) => photo.mediaId !== entry.mediaId));
      router.refresh();
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to remove photo");
    } finally {
      setRemovingPhotoId(null);
    }
  }

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
          photos_waived: photosWaived,
          photos_waiver_reason: photosWaived ? photosWaiverReason : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to save completion packet");
        return false;
      }
      toast.success("Completion packet saved");
      router.refresh();
      // Auto-PATCH close_photos item to "ok" when photos waived (best-effort side effect)
      if (photosWaived && closePhotosItemId) {
        try {
          await fetch(`/api/v1/visits/${visitId}/checklist/${closePhotosItemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ disposition: "ok" }),
          });
        } catch {
          // ignore failures — this is a convenience side-effect, not required for packet save
        }
      }
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
          <dd>
            {photoUrls.length > 0
              ? `${photoUrls.length} added`
              : photosWaived
              ? `waived — ${photosWaiverReason || "no reason"}`
              : "none"}
          </dd>
        </div>
        <div className="p7-detail-row">
          <dt>Signature</dt>
          <dd>{signatureStatus}</dd>
        </div>
      </dl>

      <div className="p7-field">
        <span className="p7-label">Completion Photos</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleFileChange}
            disabled={!canUpdate || saving || completing || uploadingPhoto}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canUpdate || saving || completing || uploadingPhoto}
          >
            {uploadingPhoto ? `Uploading${uploadProgress ? ` ${uploadProgress}` : ""}...` : "Upload Photos"}
          </Button>
          <div style={{ flex: "1 1 260px" }}>
            <label className="p7-label" htmlFor="completion-photo-url" style={{ marginBottom: "var(--space-1)" }}>
              Add by URL instead
            </label>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <input
                id="completion-photo-url"
                className="p7-input"
                value={draftPhotoUrl}
                onChange={(event) => setDraftPhotoUrl(event.target.value)}
                disabled={!canUpdate || saving || completing || uploadingPhoto}
                placeholder="Paste a photo link"
                style={{ flex: 1 }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addPhotoUrl}
                disabled={!canUpdate || saving || completing || uploadingPhoto || !draftPhotoUrl.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Quick photo waiver UI (large touch-friendly) - shown when no photos or waiver active */}
        {(!photoUrls.length || photosWaived) && (
          <div style={{ marginTop: "var(--space-2)" }}>
            <span className="p7-label">No photos needed?</span>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-1)" }}>
              {["Forgot to take photos", "No visual change / not needed", "Client declined photos"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setPhotosWaived(true);
                    setPhotosWaiverReason(preset);
                  }}
                  disabled={!canUpdate || saving || completing}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: photosWaived && photosWaiverReason === preset ? "var(--accent, #0066cc)" : "var(--bg-subtle, #f8f8f9)",
                    color: photosWaived && photosWaiverReason === preset ? "#fff" : "inherit",
                    fontSize: "var(--text-sm)",
                    cursor: "pointer",
                    minHeight: "44px",
                  }}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPhotosWaived(true);
                  setPhotosWaiverReason("");
                }}
                disabled={!canUpdate || saving || completing}
                style={{
                  padding: "10px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: photosWaived && photosWaiverReason === "" ? "var(--accent, #0066cc)" : "var(--bg-subtle, #f8f8f9)",
                  color: photosWaived && photosWaiverReason === "" ? "#fff" : "inherit",
                  fontSize: "var(--text-sm)",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                Other
              </button>
            </div>
            {photosWaived && (
              <div style={{ marginTop: "var(--space-2)" }}>
                <textarea
                  className="p7-input"
                  value={photosWaiverReason}
                  onChange={(e) => setPhotosWaiverReason(e.target.value)}
                  placeholder="Reason for waiving photos"
                  disabled={!canUpdate || saving || completing}
                  style={{ width: "100%", minHeight: "60px", resize: "vertical", fontSize: "var(--text-sm)" }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotosWaived(false);
                    setPhotosWaiverReason("");
                  }}
                  disabled={!canUpdate || saving || completing}
                  style={{
                    marginTop: "var(--space-1)",
                    fontSize: "var(--text-xs)",
                    color: "var(--fg-muted)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Clear waiver
                </button>
              </div>
            )}
          </div>
        )}

        {photoEntries.length > 0 ? (
          <div
            style={{
              marginTop: "var(--space-3)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            {photoEntries.map((photo) => (
              <div key={`${photo.url}-${photo.mediaId ?? "url"}`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div
                  style={{
                    aspectRatio: "1",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                    background: "var(--bg-subtle, #f8f8f9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.label}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", overflowWrap: "anywhere" }}>
                    {photo.label}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePhoto(photo)}
                    disabled={!canUpdate || saving || completing || removingPhotoId === photo.mediaId}
                  >
                    {removingPhotoId === photo.mediaId ? "Removing..." : "Remove"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            No completion photos added yet.
          </p>
        )}
      </div>

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
