"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  heroPhotoCategory,
  visitMediaUploadPath,
  type HeroVisit,
} from "@/lib/my-day/visit-hero";

export function HeroPhotoButton({ visit }: { visit: HeroVisit }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", heroPhotoCategory(visit.status));
      const res = await fetch(visitMediaUploadPath(visit.id), {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Upload failed");
        return;
      }
      toast.success("Photo uploaded");
      router.refresh();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="hero-photo-input"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="p7-field-hero__secondary"
        data-testid="hero-photo"
      >
        {uploading ? "…" : "Photo"}
      </button>
    </div>
  );
}
