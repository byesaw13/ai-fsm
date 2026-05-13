import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { queryOne } from "@/lib/db";
import { PageContainer, PageHeader } from "@/components/ui";
import { TemplateForm } from "../../TemplateForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const template = await queryOne(
    `SELECT * FROM plan_templates WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );
  if (!template) notFound();

  return (
    <PageContainer>
      <PageHeader title={`Edit: ${template.name}`} />
      <TemplateForm initialData={template as Parameters<typeof TemplateForm>[0]["initialData"]} />
    </PageContainer>
  );
}
