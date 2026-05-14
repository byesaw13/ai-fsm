import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/ui";
import { TemplateForm } from "../TemplateForm";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  return (
    <PageContainer>
      <PageHeader title="New Membership Template" />
      <TemplateForm />
    </PageContainer>
  );
}
