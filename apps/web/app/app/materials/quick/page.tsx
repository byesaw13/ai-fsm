import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Breadcrumbs, PageContainer, PageHeader } from "@/components/ui";
import { QuickMaterialsClient } from "./QuickMaterialsClient";

export const dynamic = "force-dynamic";

export default async function QuickMaterialsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app" },
          { label: "Quick Materials" },
        ]}
      />
      <PageHeader
        title="Quick Materials Generator"
        subtitle="Generate purchase-ready materials & supply house lists without an estimate"
      />
      <QuickMaterialsClient />
    </PageContainer>
  );
}
