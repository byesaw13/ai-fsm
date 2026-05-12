import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role === "tech") {
    redirect("/app/my-day");
  }
  redirect("/app/pipeline");
}
