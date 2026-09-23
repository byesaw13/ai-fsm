import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { businessToday } from "@/lib/operations/business-day";
import { withDbSession } from "@/lib/db";
import { ensureOpenBusinessDayIfWorked } from "@/lib/day-review/ensure-day";
import { getDayReview, loadDayCompanyFacts } from "@/lib/day-review/queries";
import { loadDayCloseStatus } from "@/lib/day-review/close-status";
import { loadDayDraft } from "@/lib/day-review/load-day-draft";
import { loadDayVisitTimelines } from "@/lib/visits/load-visit-timeline";
import { loadReviewCaptures } from "@/lib/captures/review-query";
import { loadPromiseEntityOptions } from "@/lib/captures/entity-picker";
import { LinkButton, PageContainer, PageHeader } from "@/components/ui";
import { loadStopInterview } from "@/lib/day-review/load-stop-interview";
import {
  assembleCompanyDayStoryInput,
  companyDayStory,
} from "@/lib/day-review/company-story";
import { DayCloseChecklist } from "../day-close/DayCloseChecklist";
import { CompanyDayStoryCard } from "./CompanyDayStoryCard";
import { StopInterviewSection } from "./StopInterviewSection";
import { DayDraftSection } from "./DayDraftSection";
import { PromiseStrip } from "./PromiseStrip";
import { ProductionStorySection } from "./ProductionStorySection";
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
  await withDbSession(session, (client) =>
    ensureOpenBusinessDayIfWorked(client, {
      accountId: session.accountId,
      userId: session.userId,
      date,
    }),
  );
  const canReviewPromises = session.role === "owner" || session.role === "admin";
  const [
    payload,
    closeStatus,
    productionStory,
    dayDraft,
    stopInterview,
    reviewCaptures,
    promiseEntities,
    companyFacts,
  ] = await Promise.all([
    getDayReview(session.accountId, date),
    loadDayCloseStatus(session, date),
    loadDayVisitTimelines(session.accountId, date),
    loadDayDraft(session.accountId, date),
    loadStopInterview(session.accountId, date),
    canReviewPromises ? loadReviewCaptures(session) : Promise.resolve([]),
    canReviewPromises
      ? loadPromiseEntityOptions(session, { date })
      : Promise.resolve([]),
    loadDayCompanyFacts(session.accountId, date),
  ]);

  const promiseStrip = canReviewPromises ? (
    <PromiseStrip captures={reviewCaptures} entities={promiseEntities} />
  ) : null;

  const header = (
    <PageHeader
      title="Day Review"
      subtitle={new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
      actions={
        canReviewPromises ? (
          <LinkButton href={`/app/timeline?date=${date}`} variant="ghost" size="sm">
            Vehicle tracking
          </LinkButton>
        ) : undefined
      }
    />
  );

  if (!payload) {
    return (
      <PageContainer>
        {header}
        {promiseStrip}
        <p className="text-muted-foreground mt-8 text-center">
          No business day found for {date}. Start your day first.
        </p>
      </PageContainer>
    );
  }

  const storyInput = assembleCompanyDayStoryInput({
    productionHouses: productionStory.map((c) => c.propertyName),
    visitHouses: payload.visits.map((v) => v.propertyName),
    stopHouses: stopInterview.stops
      .map((s) => s.propertyAddress)
      .filter((label): label is string => Boolean(label)),
    timeEntries: payload.timeEntries,
    milesOdometer: payload.mileage.odometerMiles,
    milesGps: payload.mileage.gpsMiles,
    milesFlagged: payload.mileage.flagged,
    clockedMinutes: dayDraft?.clockedMinutes ?? null,
    attributedMinutes: dayDraft?.attributedMinutes ?? null,
    bills: companyFacts.bills,
    comingBack: companyFacts.comingBack,
    leftoverReceipts: stopInterview.receipts.map((r) => ({
      vendor: r.vendorName,
      amountCents: r.amountCents,
    })),
    unansweredStops: stopInterview.unansweredCount,
  });
  const story = companyDayStory(storyInput);
  const hold = storyInput.billsOnHold.length === 1 ? storyInput.billsOnHold[0] : undefined;
  const holdHref = hold?.invoiceId ? `/app/invoices/${hold.invoiceId}` : null;

  const leftoverEngines = (
    <>
      {promiseStrip}
      <StopInterviewSection payload={stopInterview} />
      {dayDraft ? <DayDraftSection date={date} draft={dayDraft} /> : null}
      <ProductionStorySection cards={productionStory} />
      <details className="mb-8">
        <summary className="cursor-pointer font-semibold mb-4">Today&apos;s details</summary>
        <VisitsSection
          visits={payload.visits}
          openWorkOrdersByProperty={payload.openWorkOrdersByProperty}
        />
        <TimeSection timeEntries={payload.timeEntries} segments={payload.segments} gaps={payload.gaps} />
        <MileageSection mileage={payload.mileage} date={date} />
      </details>
    </>
  );

  return (
    <PageContainer>
      {header}
      <CompanyDayStoryCard story={story} holdHref={holdHref} />
      <DayCloseChecklist
        businessDayId={payload.businessDayId}
        dayStatus={payload.status}
        closedAt={payload.closedAt}
        initial={{ ...closeStatus, unansweredStops: stopInterview.unansweredCount }}
      />
      {story.isQuietNight ? (
        <details className="mb-8">
          <summary className="cursor-pointer font-semibold mb-4">Leftovers</summary>
          {leftoverEngines}
        </details>
      ) : (
        leftoverEngines
      )}
    </PageContainer>
  );
}
