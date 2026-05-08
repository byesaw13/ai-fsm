import { redirect } from "next/navigation";

// Command Center has been merged into the main Dashboard at /app.
export default function OwnerDashboardPage() {
  redirect("/app");
}
