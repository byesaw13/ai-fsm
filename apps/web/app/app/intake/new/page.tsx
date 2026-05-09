import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PageContainer, PageHeader } from "@/components/ui";
import { IntakeForm } from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function NewIntakePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  return (
    <PageContainer>
      <PageHeader
        title="New Intake"
        subtitle="Capture a service request while speaking with a client."
        backHref="/app/booking-requests"
      />
      <IntakeForm />
    </PageContainer>
  );
}
