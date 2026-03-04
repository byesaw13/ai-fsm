import { PageContainer, PageHeader, Skeleton } from "@/components/ui";

export default function ReportsLoading() {
  return (
    <PageContainer>
      <PageHeader title="Profitability" subtitle="Loading..." />
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Skeleton height="80px" />
      </div>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Skeleton height="200px" />
      </div>
      <Skeleton height="200px" />
    </PageContainer>
  );
}
