"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface VaultPhoto {
  id: string;
  original_name: string;
  created_at: string;
}

interface Props {
  itemId: string;
  canEdit: boolean;
}

export function VaultItemPhotoPanel({ itemId, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPhotos() {
      try {
        const res = await fetch(`/api/v1/vault-items/${itemId}/media`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (active) toast.error(data.error?.message ?? "Failed to load vault photos");
          return;
        }
        if (active) setPhotos(data.data ?? []);
      } catch {
        if (active) toast.error("Failed to load vault photos");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPhotos();
    return () => {
      active = false;
    };
  }, [itemId, toast]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/v1/vault-items/${itemId}/media`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Upload failed");
        return;
      }

      setPhotos((prev) => [...prev, data.data]);
      router.refresh();
      toast.success("Vault photo uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(photoId: string) {
    setDeletingId(photoId);
    try {
      const res = await fetch(`/api/v1/vault-items/${itemId}/media/${photoId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Delete failed");
        return;
      }

      setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
      router.refresh();
      toast.success("Vault photo deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Behind-Wall Photos{photos.length > 0 ? ` (${photos.length})` : ""}
        </div>
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="p7-btn p7-btn-secondary p7-btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "+ Photo"}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>Loading photos…</p>
      ) : photos.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          No behind-wall photos attached yet.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--space-3)" }}>
          {photos.map((photo) => (
            <div key={photo.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <a
                href={`/api/v1/vault-items/${itemId}/media/${photo.id}/image`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    aspectRatio: "1",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    backgroundImage: `url(/api/v1/vault-items/${itemId}/media/${photo.id}/image)`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: "var(--color-surface)",
                  }}
                />
              </a>
              <a
                href={`/api/v1/vault-items/${itemId}/media/${photo.id}/image`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "var(--font-size-xs)", color: "var(--color-primary)", textDecoration: "none", overflowWrap: "anywhere" }}
              >
                {photo.original_name}
              </a>
              {canEdit && (
                <button
                  type="button"
                  className="p7-btn p7-btn-ghost p7-btn-sm"
                  onClick={() => handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                  style={{ justifyContent: "flex-start", paddingLeft: 0, color: "var(--color-error, #dc2626)" }}
                >
                  {deletingId === photo.id ? "Deleting…" : "Remove Photo"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
