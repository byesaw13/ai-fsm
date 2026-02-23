import { PageContainer, PageHeader, Skeleton, SkeletonCard } from "@/components/ui";

export default function JobsLoading() {
  return (
    <PageContainer>
      <PageHeader
        title="Jobs"
        subtitle="Loading jobs…"
        actions={<Skeleton width="96px" height="36px" />}
      />
      <Skeleton height="56px" />
      <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        {Array.from({ length: 2 }).map((_, sectionIdx) => (
          <section key={sectionIdx} style={{ display: "grid", gap: "var(--space-3)" }}>
            <Skeleton width="140px" height="24px" />
            <SkeletonCard />
            <SkeletonCard />
          </section>
        ))}
      </div>
    </PageContainer>
  );
}

