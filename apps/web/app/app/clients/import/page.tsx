import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/ui";
import { ClientImportForm } from "./ClientImportForm";

export const dynamic = "force-dynamic";

export default async function ClientImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app/clients");

  return (
    <PageContainer>
      <PageHeader
        title="Import Customers from CSV"
        subtitle="Upload a Square customer export or any CSV with customer data."
        backHref="/app/clients"
        backLabel="Customers"
      />
      <ClientImportForm />
    </PageContainer>
  );
}
