import { PageContainer, PageHeader, Skeleton, SkeletonCard } from "@/components/ui";

export default function VisitsLoading() {
  return (
    <PageContainer>
      <PageHeader title="Visits" subtitle="Loading visits…" />
      <div style={{ marginTop: "var(--space-4)" }}>
        <Skeleton height="96px" />
      </div>
      <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        {Array.from({ length: 3 }).map((_, idx) => (
          <section key={idx} style={{ display: "grid", gap: "var(--space-3)" }}>
            <Skeleton width="160px" height="24px" />
            <SkeletonCard />
          </section>
        ))}
      </div>
    </PageContainer>
  );
}

