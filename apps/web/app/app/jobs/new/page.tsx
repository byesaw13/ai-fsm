import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canTransitionJob } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canTransitionJob(session.role)) redirect("/app/jobs");

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">New Job</h1>
      </div>
      <div className="card">
        <p className="muted">Job creation form — coming in a follow-up PR (P2-T1 merge required).</p>
      </div>
    </div>
  );
}
