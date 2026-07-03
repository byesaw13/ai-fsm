import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

// EPIC-006: technicians have no access to this business area. Guarding at the
// layout covers the index page AND every nested route ([id], new, etc.), so a
// tech who is linked to a specific id is still redirected to My Day.
export default async function EstimatesLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-work");
  return <>{children}</>;
}
