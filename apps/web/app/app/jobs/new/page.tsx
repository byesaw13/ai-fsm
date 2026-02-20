import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { canTransitionJob } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { JobCreateForm } from "./JobCreateForm";

export const dynamic = "force-dynamic";

interface Client {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface Property {
  id: string;
  address: string;
  client_id: string;
  [key: string]: unknown;
}

export default async function NewJobPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canTransitionJob(session.role)) redirect("/app/jobs");

  const [clients, properties] = await Promise.all([
    query<Client>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`,
      [session.accountId]
    ),
    query<Property>(
      `SELECT id, address, client_id FROM properties WHERE account_id = $1 ORDER BY address ASC`,
      [session.accountId]
    ),
  ]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href="/app/jobs" className="back-link">
            ← Jobs
          </Link>
          <h1 className="page-title">New Job</h1>
        </div>
      </div>

      <div className="card">
        <JobCreateForm clients={clients} properties={properties} />
      </div>
    </div>
  );
}
