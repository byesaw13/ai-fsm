import { PageContainer, PageHeader, Skeleton, SkeletonCard } from "@/components/ui";

export default function ExpensesLoading() {
  return (
    <PageContainer>
      <PageHeader
        title="Expenses"
        subtitle="Loading…"
        actions={<Skeleton width="120px" height="36px" />}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        <Skeleton height="72px" />
        <Skeleton height="72px" />
        <Skeleton height="72px" />
      </div>
      <Skeleton height="56px" />
      <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <section key={i} style={{ display: "grid", gap: "var(--space-3)" }}>
            <Skeleton width="180px" height="24px" />
            <SkeletonCard />
            <SkeletonCard />
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
