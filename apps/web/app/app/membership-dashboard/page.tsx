import { redirect } from "next/navigation";

// Membership dashboard has been merged into the home view at /app.
export default function MembershipDashboardPage() {
  redirect("/app");
}
