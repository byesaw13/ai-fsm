"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

const PHOTO_ROLES = [
  { value: "general", label: "General" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "during", label: "During" },
  { value: "inspection", label: "Inspection" },
  { value: "diagram", label: "Diagram" },
] as const;

type PhotoRole = (typeof PHOTO_ROLES)[number]["value"];

interface VaultPhoto {
  id: string;
  original_name: string;
  size_bytes: number;
  photo_role: PhotoRole;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  itemId: string;
  canEdit: boolean;
  onPhotoCountChange?: (count: number) => void;
}

export function VaultItemPhotoPanel({ itemId, canEdit, onPhotoCountChange }: Props) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<PhotoRole>("general");

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
        const loaded: VaultPhoto[] = data.data ?? [];
        if (active) {
          setPhotos(loaded);
          onPhotoCountChange?.(loaded.length);
        }
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
  }, [itemId, toast, onPhotoCountChange]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("photo_role", selectedRole);

      const res = await fetch(`/api/v1/vault-items/${itemId}/media`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Upload failed");
        return;
      }

      setPhotos((prev) => {
        const next = [...prev, data.data];
        onPhotoCountChange?.(next.length);
        return next;
      });
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

      setPhotos((prev) => {
        const next = prev.filter((photo) => photo.id !== photoId);
        onPhotoCountChange?.(next.length);
        return next;
      });
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <select
              className="p7-select"
              style={{ fontSize: "var(--font-size-xs)", padding: "2px 6px", height: "auto" }}
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as PhotoRole)}
              disabled={uploading}
            >
              {PHOTO_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
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
          </div>
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
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                {PHOTO_ROLES.find((r) => r.value === photo.photo_role)?.label ?? "General"} · {formatBytes(photo.size_bytes)}
              </span>
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
