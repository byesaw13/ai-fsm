import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDayReview } from "@/lib/day-review/queries";
import { PageContainer, PageHeader } from "@/components/ui";
import { VisitsSection } from "./VisitsSection";
import { TimeSection } from "./TimeSection";
import { MileageSection } from "./MileageSection";
import { CloseButton } from "./CloseButton";

export const dynamic = "force-dynamic";

export default async function DayReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const date = sp.date ?? new Date().toISOString().slice(0, 10);
  const payload = await getDayReview(session.accountId, date);

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
      <VisitsSection visits={payload.visits} />
      <TimeSection segments={payload.segments} gaps={payload.gaps} />
      <MileageSection mileage={payload.mileage} />
      <div className="mt-8 pb-8">
        <CloseButton
          businessDayId={payload.businessDayId}
          status={payload.status}
          closedAt={payload.closedAt}
        />
      </div>
    </PageContainer>
  );
}
