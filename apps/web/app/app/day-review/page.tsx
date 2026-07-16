import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { businessToday } from "@/lib/operations/business-day";
import { getDayReview } from "@/lib/day-review/queries";
import { loadDayCloseStatus } from "@/lib/day-review/close-status";
import { PageContainer, PageHeader } from "@/components/ui";
import { DayCloseChecklist } from "../day-close/DayCloseChecklist";
import { VisitsSection } from "./VisitsSection";
import { TimeSection } from "./TimeSection";
import { MileageSection } from "./MileageSection";

export const dynamic = "force-dynamic";

export default async function DayReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  // Default to today in the business timezone — a UTC date rolls over to
  // tomorrow during evening hours, so the owner couldn't review the current day.
  const date = sp.date ?? businessToday();
  const [payload, closeStatus] = await Promise.all([
    getDayReview(session.accountId, date),
    loadDayCloseStatus(session, date),
  ]);

  if (!payload) {
    return (
      <PageContainer>
        <PageHeader title="Day Review" />
        <p className="text-muted-foreground mt-8 text-center">
          No business day found for {date}. Start your day first.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Day Review"
        subtitle={new Date(date + "T12:00:00").toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      />
      <DayCloseChecklist
        businessDayId={payload.businessDayId}
        dayStatus={payload.status}
        closedAt={payload.closedAt}
        initial={closeStatus}
      />
      <details className="mb-8">
        <summary className="cursor-pointer font-semibold mb-4">Today&apos;s details</summary>
        <VisitsSection visits={payload.visits} />
        <TimeSection segments={payload.segments} gaps={payload.gaps} />
        <MileageSection mileage={payload.mileage} />
      </details>
    </PageContainer>
  );
}
