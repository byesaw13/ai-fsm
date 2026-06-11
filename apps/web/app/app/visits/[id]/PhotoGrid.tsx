"use client";

import { useRef, useState } from "react";
import Image from "next/image";
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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    const failures: string[] = [];
    let lastErrorMessage: string | null = null;
    let next = photos;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(files.length > 1 ? `${i + 1} of ${files.length}` : null);
        const file = files[i];
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
            failures.push(file.name);
            lastErrorMessage = data.error?.message ?? "Upload failed";
          } else {
            const newPhoto: PhotoMeta = data.data;
            next = [...next, newPhoto];
            setPhotos(next);
            onCountChange?.(next.length);
          }
        } catch {
          failures.push(file.name);
          lastErrorMessage = "Upload failed";
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
            ? lastErrorMessage ?? "Upload failed"
            : `${failures.length} of ${files.length} photos failed to upload (${failures.join(", ")})`
        );
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
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
            <Image
              src={`/api/v1/visits/${visitId}/media/${photo.id}/image`}
              alt={photo.original_name}
              fill
              unoptimized
              style={{ objectFit: "cover" }}
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
            multiple
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
            {uploading ? `Uploading${uploadProgress ? ` ${uploadProgress}` : ""}…` : "+ Add Photos"}
          </button>
        </>
      )}

      {photos.length === 0 && !canUpload && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>No photos yet.</p>
      )}
    </div>
  );
}
