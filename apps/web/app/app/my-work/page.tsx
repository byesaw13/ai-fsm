import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { formatVisitTime } from "@/lib/visits/formatting";
import { BUSINESS_TIMEZONE } from "@/lib/time/business-tz";
import { pickHeroVisit, type HeroVisit } from "@/lib/my-day/visit-hero";
import { loadFieldDayData } from "@/lib/my-work/field-day-data";
import {
  loadPendingArrivalProposals,
  loadOpenWorkOrdersForProperties,
} from "@/lib/field/load-arrival-proposals";
import { MyDayMobileLayout } from "../my-day/MyDayMobileLayout";
import { ManualSiteVisitButton } from "../ManualSiteVisitButton";
import { LocationCaptureControl } from "../LocationCaptureControl";
import { ArrivalProposalBanner } from "@/components/field/ArrivalProposalBanner";
import { Suspense } from "react";
import {
  OPERATIONAL_VISIT_TYPES,
  VISIT_TYPE_LABELS,
  type VisitType,
} from "@ai-fsm/domain";
import { PageContainer, PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { loadNeedsAttention } from "@/lib/attention/load-needs-attention";
import { NeedsAttentionPanel } from "../NeedsAttentionPanel";
import { TodayTimeline } from "./TodayTimeline";
import { compareTodayWork, standaloneLookTodaySql, todayEmptyCopy, todayWorkHeading } from "./today-list";
import { filterAttentionForSurface } from "@/lib/attention/surfaces";
import { todayCoveringTechSql } from "@/lib/visits/covering-tech";
import { materialsNeededCount, fieldPlaceTitle, showLeaveList } from "@/lib/field/face";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ promises?: string }>;
};

type WoCard = {
  id: string;
  job_id: string;
  title: string;
  status: string;
  client_name: string | null;
  property_address: string | null;
  next_scheduled: string | null;
  active_visit_id: string | null;
  face_visit_id: string | null;
  face_scheduled: string | null;
  materials_needed: string | null;
  first_up: string | null;
};

type AssessmentCard = {
  id: string;
  visit_type: string;
  scheduled_start: string;
  status: string;
  client_name: string | null;
  job_title: string | null;
  property_address: string | null;
  materials_needed: string | null;
};

export default async function MyWorkPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "admin") redirect("/app");
  const { promises: promisesParam } = await searchParams;

  const isTech = session.role === "tech";
  const isOwner = session.role === "owner";
  const opTypes = [...OPERATIONAL_VISIT_TYPES];
  const now = new Date();

  const [fieldDay, workOrders, assessments, heroVisits, proposals] = await Promise.all([
    loadFieldDayData(session, isOwner),
    queryForSession<WoCard>(
      session,
      `SELECT w.id, w.job_id::text, w.title, w.status, c.name AS client_name, p.address AS property_address,
              (SELECT MIN(v.scheduled_start)::text FROM visits v
               WHERE v.work_order_id = w.id AND v.status = 'scheduled' AND v.scheduled_start > now()) AS next_scheduled,
              (SELECT v.id::text FROM visits v
               WHERE v.work_order_id = w.id AND v.assigned_user_id = $2
                 AND v.status IN ('dispatched','traveling','arrived','in_progress','waiting')
               LIMIT 1) AS active_visit_id,
              face.face_visit_id,
              face.face_scheduled,
              face.materials_needed,
              (SELECT t.label FROM visit_tasks vt
               JOIN work_order_tasks t ON t.id = vt.task_id
               JOIN visits vfirst ON vfirst.id = vt.visit_id
               WHERE vt.visit_id = face.face_visit_id::uuid AND vfirst.assigned_user_id = $2
                 AND vfirst.status NOT IN ('completed','cancelled')
                 AND t.completed = false AND t.status <> 'done'
               ORDER BY CASE WHEN t.status = 'partial' THEN 1 ELSE 0 END, t.sort_order ASC LIMIT 1) AS first_up
       FROM work_orders w
       JOIN jobs j ON j.id = w.job_id
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN LATERAL (
         SELECT v.id::text AS face_visit_id,
                v.scheduled_start::text AS face_scheduled,
                v.materials_needed
         FROM visits v
         WHERE v.work_order_id = w.id
           AND v.assigned_user_id = $2
           AND v.status NOT IN ('completed','cancelled')
           AND ${standaloneLookTodaySql(BUSINESS_TIMEZONE)}
         ORDER BY
           CASE WHEN v.status IN ('arrived','in_progress','waiting','dispatched','traveling') THEN 0 ELSE 1 END,
           v.scheduled_start ASC
         LIMIT 1
       ) face ON true
       WHERE w.account_id = $1 AND ${todayCoveringTechSql("$2")}
         AND w.status NOT IN ('draft','completed','cancelled')
         AND face.face_visit_id IS NOT NULL
       ORDER BY
         CASE w.status WHEN 'dispatched' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
         next_scheduled NULLS LAST,
         w.updated_at DESC`,
      [session.accountId, session.userId],
    ),
    queryForSession<AssessmentCard>(
      session,
      `SELECT v.id, v.visit_type, v.scheduled_start::text, v.status,
              c.name AS client_name, j.title AS job_title, p.address AS property_address,
              v.materials_needed
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1 AND v.assigned_user_id = $2
         AND v.work_order_id IS NULL
         AND v.visit_type = ANY($3::text[])
         AND v.status NOT IN ('completed','cancelled')
         AND ${standaloneLookTodaySql(BUSINESS_TIMEZONE)}
       ORDER BY v.scheduled_start ASC
       LIMIT 50`,
      [session.accountId, session.userId, opTypes],
    ),
    queryForSession<HeroVisit>(
      session,
      `SELECT v.id, v.status, v.scheduled_start::text, j.id::text AS job_id, j.title AS job_title,
              p.address AS property_address, c.name AS client_name, c.phone AS client_phone,
              v.materials_needed,
              (SELECT t.label FROM visit_tasks vt
               JOIN work_order_tasks t ON t.id = vt.task_id
               WHERE vt.visit_id = v.id AND vt.account_id = v.account_id
                 AND t.completed = false AND t.status <> 'done'
               ORDER BY CASE WHEN t.status = 'partial' THEN 1 ELSE 0 END, t.sort_order ASC LIMIT 1) AS first_up
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1 AND v.assigned_user_id = $2
         AND v.status NOT IN ('completed','cancelled')
         AND ${standaloneLookTodaySql(BUSINESS_TIMEZONE)}
       ORDER BY v.scheduled_start ASC
       LIMIT 100`,
      [session.accountId, session.userId],
    ),
    loadPendingArrivalProposals(session),
  ]);

  const propIds = [
    ...new Set(
      proposals.map((p) => p.propertyId).filter((id): id is string => !!id),
    ),
  ];
  const openWorkOrdersByProperty = await loadOpenWorkOrdersForProperties(
    session,
    propIds,
  );

  const heroVisit = pickHeroVisit(heroVisits, now.getTime());
  const needsAttentionRaw = isOwner ? await loadNeedsAttention(session) : null;
  const needsAttention = needsAttentionRaw
    ? { items: filterAttentionForSurface(needsAttentionRaw.items, "today"), openPromiseRows: [] as typeof needsAttentionRaw.openPromiseRows }
    : null;

  const dayStarted = !!fieldDay.openSession;
  const heroVisible = !!heroVisit && (dayStarted || showLeaveList(heroVisit.status)) && proposals.length === 0;
  const heroId = heroVisible ? heroVisit?.id ?? null : null;
  const otherStops = [
    ...workOrders.map((wo) => ({
      kind: "job" as const,
      active: Boolean(wo.active_visit_id),
      sortTime: wo.face_scheduled ?? wo.next_scheduled,
      faceId: wo.face_visit_id,
      wo,
    })),
    ...assessments.map((visit) => ({
      kind: "look" as const,
      active: ["dispatched", "traveling", "arrived", "in_progress", "waiting"].includes(visit.status),
      sortTime: visit.scheduled_start,
      faceId: visit.id,
      visit,
    })),
  ]
    .filter((item) => item.faceId !== heroId)
    .sort(compareTodayWork);

  return (
    <PageContainer>
      <PageHeader title="Today" />

      {proposals.length > 0 && (() => {
        const active = fieldDay.activityEntries?.find((e) => e.ended_at === null && e.user_id === session.userId) ?? null;
        const top = proposals[0];
        const alreadyOnSiteWork =
          !!active &&
          (active.activity_type === "job_work" || active.activity_type === "estimate_visit") &&
          !!(
            (top?.workOrderId &&
              active.entity_type === "work_order" &&
              active.entity_id === top.workOrderId) ||
            (top?.visitId &&
              active.entity_type === "visit" &&
              active.entity_id === top.visitId)
          );
        return (
          <Suspense fallback={null}>
            <ArrivalProposalBanner
              proposals={proposals}
              openWorkOrdersByProperty={openWorkOrdersByProperty}
              activityType={active?.activity_type ?? null}
              alreadyOnSiteWork={alreadyOnSiteWork}
            />
          </Suspense>
        );
      })()}

      <MyDayMobileLayout
        openSession={fieldDay.openSession}
        vehicles={fieldDay.vehicles}
        activityEntries={fieldDay.activityEntries.filter((e) => e.user_id === session.userId)}
        dayMileage={fieldDay.dayMileage}
        heroVisit={heroVisit}
        clockedIn={fieldDay.clockedIn}
        hasParkProposal={proposals.length > 0}
        currentJobId={heroVisit?.job_id ?? workOrders.find((w) => w.active_visit_id)?.job_id ?? null}
        canCapture={isOwner}
        canQuickBook={isOwner}
        priorDayNeedsMileage={fieldDay.priorDayNeedsMileage}
        priorOpenSession={fieldDay.priorOpenSession}
        more={
          <>
            <div className="field-more__links">
              {isTech ? (
                <LinkButton href="/app/visits" variant="secondary" size="sm">Visits</LinkButton>
              ) : (
                <>
                  <LinkButton href={"/app/timeline" as Route} variant="ghost" size="sm">
                    Vehicle tracking
                  </LinkButton>
                  <ManualSiteVisitButton />
                  <LinkButton href="/app" variant="secondary" size="sm">Desk</LinkButton>
                </>
              )}
            </div>
            {fieldDay.locationSettings ? (
              <LocationCaptureControl
                enabled={fieldDay.locationSettings.enabled}
                pausedUntil={fieldDay.locationSettings.pausedUntil}
                hasActiveWorkday={!!fieldDay.openSession}
                showTrackingLink={!isTech}
              />
            ) : null}
            <TodayTimeline
              entries={
                isTech
                  ? fieldDay.activityEntries.filter((e) => e.user_id === session.userId)
                  : fieldDay.activityEntries
              }
              showTrackingLink={!isTech}
            />
          </>
        }
      >
        {needsAttention && needsAttention.items.length > 0 ? (
          <NeedsAttentionPanel
            items={needsAttention.items}
            openPromiseRows={needsAttention.openPromiseRows}
            promisesParam={promisesParam}
          />
        ) : null}
        {otherStops.length === 0 && !heroVisit ? (
          <EmptyState
            title={todayEmptyCopy().title}
            description={todayEmptyCopy().description}
          />
        ) : otherStops.length > 0 ? (
          <section>
            <h2 className="field-kicker">{todayWorkHeading()}</h2>
            <ul className="field-today-list">
              {otherStops.map((item) => {
                if (item.kind === "job") {
                  const wo = item.wo;
                  const when = wo.face_scheduled ?? wo.next_scheduled;
                  const missing = materialsNeededCount(wo.materials_needed) > 0;
                  return (
                    <li key={`job-${wo.id}`}>
                      <Link href={(wo.face_visit_id ? `/app/visits/${wo.face_visit_id}` : `/app/my-work/${wo.id}`) as Route}>
                        <span className="when">{when ? formatVisitTime(when) : ""}</span>
                        <span className="who">{fieldPlaceTitle(wo.client_name, wo.property_address)}</span>
                        <span className="purpose">{wo.title}</span>
                        {missing ? <span className="miss">Material missing</span> : null}
                      </Link>
                    </li>
                  );
                }
                const visit = item.visit;
                const purpose = visit.job_title || (VISIT_TYPE_LABELS[visit.visit_type as VisitType] ?? "Look");
                const missing = materialsNeededCount(visit.materials_needed) > 0;
                return (
                  <li key={`look-${visit.id}`}>
                    <Link href={`/app/visits/${visit.id}` as Route}>
                      <span className="when">{formatVisitTime(visit.scheduled_start)}</span>
                      <span className="who">{fieldPlaceTitle(visit.client_name, visit.property_address)}</span>
                      <span className="purpose">{purpose}</span>
                      {missing ? <span className="miss">Material missing</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </MyDayMobileLayout>
    </PageContainer>
  );
}
