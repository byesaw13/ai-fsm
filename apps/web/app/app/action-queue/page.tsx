import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ promises?: string }>;
};

/** TASK-129: the queue lives on My Day `#attention`. Keep this URL for deep links. */
export default async function ActionQueuePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-work");
  const { promises } = await searchParams;
  const dest = promises
    ? "/app/my-work?promises=1#attention"
    : "/app/my-work#attention";
  redirect(dest as Route);
}
