import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Memberships / maintenance plans are paused indefinitely.
 *
 * The pages, API routes, and DB tables are intentionally retained so the
 * feature can be revived without rebuilding it, but the UI is hidden: this
 * layout redirects every `/app/maintenance-plans/*` route back to the app
 * home so the surface is unreachable while paused.
 *
 * To revive: flip MEMBERSHIPS_ENABLED to true (and restore the nav/settings
 * links + worker membership tasks).
 */
const MEMBERSHIPS_ENABLED = false;

export default function MaintenancePlansLayout({ children }: { children: ReactNode }) {
  if (!MEMBERSHIPS_ENABLED) {
    redirect("/app");
  }
  return <>{children}</>;
}
