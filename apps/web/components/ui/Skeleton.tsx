// ---------------------------------------------------------------------------
// Skeleton — shimmer loading placeholder
// ---------------------------------------------------------------------------

interface SkeletonProps {
  width?: string;
  height?: string;
  lines?: number;
  className?: string;
  rounded?: boolean;
}

/** Single skeleton block with optional dimensions */
export function Skeleton({
  width = "100%",
  height = "16px",
  className = "",
  rounded = false,
}: SkeletonProps) {
  return (
    <span
      className={`p7-skeleton ${className}`}
      style={{
        width,
        height,
        display: "block",
        borderRadius: rounded ? "var(--radius-full)" : undefined,
      }}
      aria-hidden="true"
    />
  );
}

/** SkeletonText — multiple lines of skeleton text */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 && lines > 1 ? "70%" : "100%"}
          height="14px"
        />
      ))}
    </div>
  );
}

/** SkeletonCard — card-shaped skeleton block */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`p7-card ${className}`} aria-hidden="true">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Skeleton width="180px" height="18px" />
          <Skeleton width="60px" height="20px" rounded />
        </div>
        <Skeleton width="120px" height="13px" />
        <Skeleton width="100%" height="13px" />
      </div>
    </div>
  );
}
