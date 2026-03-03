import { PageContainer, PageHeader, Skeleton, SkeletonCard } from "@/components/ui";

export default function ExpenseDetailLoading() {
  return (
    <PageContainer>
      <PageHeader
        title="Expense"
        subtitle="Loading…"
        actions={<Skeleton width="80px" height="32px" />}
      />
      <div className="p7-detail-layout">
        <div className="p7-detail-primary" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <SkeletonCard />
        </div>
        <div className="p7-detail-sidebar" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <SkeletonCard />
        </div>
      </div>
    </PageContainer>
  );
}
