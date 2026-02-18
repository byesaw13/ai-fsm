import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateVisit } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function NewVisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateVisit(session.role)) redirect(`/app/jobs/${id}`);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Schedule Visit</h1>
      </div>
      <div className="card">
        <p className="muted">Visit scheduling form — coming in a follow-up PR (P2-T2 merge required).</p>
      </div>
    </div>
  );
}
