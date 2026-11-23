import { PageContainer, PageHeader, Card, SkeletonCard, SkeletonText } from "@/components/ui";

export default function PropertiesLoading() {
  return (
    <PageContainer>
      <PageHeader title="Properties" subtitle="Loading…" />
      <SkeletonCard />
      <Card><SkeletonText lines={4} /></Card>
    </PageContainer>
  );
}
