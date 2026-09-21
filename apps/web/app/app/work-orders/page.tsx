import { redirect } from "next/navigation";

/** Work orders stay internal packets under a Job. The human list is Jobs. */
export default function WorkOrdersPage() {
  redirect("/app/jobs");
}
