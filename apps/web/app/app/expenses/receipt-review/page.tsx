import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageExpenses } from "@/lib/auth/permissions";
import { PageContainer, PageHeader, LinkButton } from "@/components/ui";
import { ReceiptReviewClient } from "./ReceiptReviewClient";

export const dynamic = "force-dynamic";

export default async function ReceiptReviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageExpenses(session.role)) redirect("/app/expenses");

  return (
    <PageContainer>
      <PageHeader
        title="Receipt review"
        subtitle="Link unlinked materials receipts using Supply PO (e.g. J260029). Confirm before assigning."
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <LinkButton href="/app/expenses" variant="ghost" size="sm">
              ← Expenses
            </LinkButton>
            <LinkButton href="/app/expenses/new?mode=run" variant="secondary" size="sm">
              Material run
            </LinkButton>
          </div>
        }
      />
      <ReceiptReviewClient />
    </PageContainer>
  );
}
