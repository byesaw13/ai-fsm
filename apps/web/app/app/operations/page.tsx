import { redirect } from "next/navigation";

// Operations dashboard has been merged into the home view at /app.
export default function OperationsPage() {
  redirect("/app");
}
