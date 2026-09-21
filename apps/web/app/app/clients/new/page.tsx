import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { ClientForm } from "../ClientForm";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  return (
    <PageContainer>
      <PageHeader title="New person" backHref="/app/clients" backLabel="People" />
      <Card>
        <ClientForm mode="create" actionUrl="/api/v1/clients" cancelHref="/app/clients" />
      </Card>
    </PageContainer>
  );
}
