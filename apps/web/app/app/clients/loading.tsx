import { PageContainer, PageHeader, Card, SkeletonCard, SkeletonText } from "@/components/ui";

export default function ClientsLoading() {
  return (
    <PageContainer>
      <PageHeader title="Clients" subtitle="Loading…" />
      <SkeletonCard />
      <Card><SkeletonText lines={4} /></Card>
    </PageContainer>
  );
}
