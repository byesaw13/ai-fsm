import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PageContainer, PageHeader } from "@/components/ui";
import { loadNeedsAttention } from "@/lib/attention/load-needs-attention";
import { NeedsAttentionPanel } from "../NeedsAttentionPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ promises?: string }>;
};

/** Owners land on My Day `#attention`. Admins keep this page (no My Day). */
export default async function ActionQueuePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-work");
  const { promises } = await searchParams;
  if (session.role === "owner") {
    const dest = promises
      ? "/app/my-work?promises=1#attention"
      : "/app/my-work#attention";
    redirect(dest as Route);
  }

  const { items, openPromiseRows } = await loadNeedsAttention(session);
  return (
    <PageContainer>
      <PageHeader title="Needs attention" />
      <NeedsAttentionPanel
        items={items}
        openPromiseRows={openPromiseRows}
        promisesParam={promises}
      />
    </PageContainer>
  );
}
