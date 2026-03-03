import { PageContainer, PageHeader, Skeleton, SkeletonCard } from "@/components/ui";

export default function VisitDetailLoading() {
  return (
    <PageContainer>
      <PageHeader
        title="Visit"
        subtitle="Loading…"
        actions={<Skeleton width="80px" height="24px" rounded />}
      />
      <div className="p7-detail-layout">
        <div className="p7-detail-primary" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="p7-detail-sidebar" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </PageContainer>
  );
}
