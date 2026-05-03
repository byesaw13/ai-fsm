"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface PhotoMeta {
  id: string;
  original_name: string;
  created_at: string;
}

interface Props {
  visitId: string;
  category: "before" | "after" | "receipt";
  initialPhotos: PhotoMeta[];
  canUpload: boolean;
  canDelete: boolean;
  onCountChange?: (count: number) => void;
}

export function PhotoGrid({ visitId, category, initialPhotos, canUpload, canDelete, onCountChange }: Props) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoMeta[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const res = await fetch(`/api/v1/visits/${visitId}/media`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Upload failed");
      } else {
        const newPhoto: PhotoMeta = data.data;
        const next = [...photos, newPhoto];
        setPhotos(next);
        onCountChange?.(next.length);
        router.refresh();
        toast.success("Photo uploaded");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(photoId: string) {
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/media/${photoId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error?.message ?? "Delete failed");
      } else {
        const next = photos.filter((p) => p.id !== photoId);
        setPhotos(next);
        onCountChange?.(next.length);
        router.refresh();
        toast.success("Photo deleted");
      }
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--space-2)",
          marginBottom: photos.length > 0 ? "var(--space-3)" : 0,
        }}
      >
        {photos.map((photo) => (
          <div
            key={photo.id}
            style={{ position: "relative", aspectRatio: "1", borderRadius: "var(--radius-sm)", overflow: "hidden" }}
          >
            <img
              src={`/api/v1/visits/${visitId}/media/${photo.id}/image`}
              alt={photo.original_name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {canDelete && (
              <button
                onClick={() => handleDelete(photo.id)}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "2px 6px",
                  fontSize: "var(--text-xs)",
                  cursor: "pointer",
                  lineHeight: 1.4,
                }}
                aria-label={`Delete ${photo.original_name}`}
                type="button"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {canUpload && (
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
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p7-btn p7-btn-secondary p7-btn-sm"
            style={{ marginTop: photos.length > 0 ? "var(--space-1)" : 0 }}
          >
            {uploading ? "Uploading…" : "+ Add Photo"}
          </button>
        </>
      )}

      {photos.length === 0 && !canUpload && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>No photos yet.</p>
      )}
    </div>
  );
}
