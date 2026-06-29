import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

// EPIC-006 Phase 5: the Settings *index* shows a profile-only view to techs (so
// they can edit their profile and sign out on mobile). Admin-only areas under
// settings — Company, Team, Tools, System Health — are gated inside the index
// page and on the system-health route itself, not here.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <>{children}</>;
}
