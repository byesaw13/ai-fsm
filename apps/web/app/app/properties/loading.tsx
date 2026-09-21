import { PageContainer, PageHeader, Card, SkeletonCard, SkeletonText } from "@/components/ui";

export default function PropertiesLoading() {
  return (
    <PageContainer>
      <PageHeader title="Houses" subtitle="Loading…" />
      <SkeletonCard />
      <Card><SkeletonText lines={4} /></Card>
    </PageContainer>
  );
}
