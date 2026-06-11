import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PageContainer, PageHeader } from "@/components/ui";
import { ImportExpensesClient } from "./ImportExpensesClient";

export const dynamic = "force-dynamic";

export default async function ImportExpensesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  return (
    <PageContainer>
      <PageHeader
        title="Import store purchases"
        subtitle="Upload a Home Depot purchase export → one expense per trip, plus updated material prices for estimates"
        backHref="/app/expenses"
      />
      <ImportExpensesClient />
    </PageContainer>
  );
}
