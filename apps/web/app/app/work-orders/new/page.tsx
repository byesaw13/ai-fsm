import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    visit_id?: string;
    client_id?: string;
    property_id?: string;
    job_id?: string;
  }>;
}

/** Humans create a Job. Work orders remain internal packets. */
export default async function NewWorkOrderPage({ searchParams }: PageProps) {
  const { client_id, property_id } = await searchParams;
  const q = new URLSearchParams();
  if (client_id) q.set("client_id", client_id);
  if (property_id) q.set("property_id", property_id);
  const s = q.toString();
  redirect(s ? `/app/jobs/new?${s}` : "/app/jobs/new");
}
