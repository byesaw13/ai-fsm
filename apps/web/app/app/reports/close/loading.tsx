import { PageContainer, PageHeader, Skeleton } from "@/components/ui";

export default function CloseLoading() {
  return (
    <PageContainer>
      <PageHeader title="Month-End Close" subtitle="Loading…" />
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Skeleton height="40px" />
      </div>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Skeleton height="60px" />
      </div>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Skeleton height="180px" />
      </div>
      <Skeleton height="140px" />
    </PageContainer>
  );
}
