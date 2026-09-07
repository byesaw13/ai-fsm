"use client";

import { useEffect, useRef, useState } from "react";

export type JobPhotoThumb = {
  id: string;
  visit_id: string;
  category: string;
  original_name: string;
};

/** Loads originals only after the gallery is on-screen (desktop layout stays display:none). */
export function JobPhotoGallery({ photos }: { photos: JobPhotoThumb[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setActive(true);
      },
      { rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "var(--space-2)",
      }}
    >
      {photos.map((photo) => (
        <a
          key={photo.id}
          href={`/app/visits/${photo.visit_id}`}
          style={{
            display: "block",
            aspectRatio: "1",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {active ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/visits/${photo.visit_id}/media/${photo.id}/image`}
              alt={photo.original_name || photo.category || "Job photo"}
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : null}
        </a>
      ))}
    </div>
  );
}
