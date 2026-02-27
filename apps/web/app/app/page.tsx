import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllJobs, canManageClients } from "@/lib/auth/permissions";
import {
  Card,
  LinkButton,
  MetricGrid,
  PageContainer,
  PriorityBadge,
  RoleBadge,
  SectionHeader,
  StatusBadge,
  priorityLabel,
  priorityNumToVariant,
} from "@/components/ui";
import type { MetricCardData, PriorityVariant, StatusVariant } from "@/components/ui";
import type { JobStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface UserRow { full_name: string; [key: string]: unknown }
interface CountRow { count: string; [key: string]: unknown }
interface AmountRow { amount_cents: string; [key: string]: unknown }
interface RecentJobRow {
  id: string;
  title: string;
  status: string;
  priority: number;
  created_at: string;
  client_name: string | null;
  [key: string]: unknown;
}
interface ReadyToInvoiceRow {
  id: string;
  title: string;
  client_name: string | null;
  updated_at: string;
  [key: string]: unknown;
}
interface OpenEstimateRow { count: string; expiring_soon: string; [key: string]: unknown }
interface UpcomingVisitRow {
  id: string;
  scheduled_start: string;
  job_title: string;
  property_address: string | null;
  [key: string]: unknown;
}

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllJobs(session.role);
  const isAdminOrOwner = canManageClients(session.role);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    userRows,
    clientCountRows,
    openJobCountRows,
    todayVisitRows,
    outstandingRows,
    recentJobs,
    upcomingVisits,
    readyToInvoice,
    openEstimateRows,
  ] = await Promise.all([
    query<UserRow>(`SELECT full_name FROM users WHERE id = $1`, [session.userId]),

    isAdmin
      ? query<CountRow>(`SELECT COUNT(*)::text AS count FROM clients WHERE account_id = $1`, [session.accountId])
      : Promise.resolve([{ count: "0" }] as CountRow[]),

    isAdmin
      ? query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM jobs WHERE account_id = $1 AND status NOT IN ('completed','invoiced','cancelled')`,
          [session.accountId]
        )
      : query<CountRow>(
          `SELECT COUNT(DISTINCT j.id)::text AS count FROM jobs j JOIN visits v ON v.job_id = j.id WHERE j.account_id = $1 AND v.assigned_user_id = $2 AND j.status NOT IN ('completed','invoiced','cancelled')`,
          [session.accountId, session.userId]
        ),

    isAdmin
      ? query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM visits WHERE account_id = $1 AND scheduled_start >= $2 AND scheduled_start < $3`,
          [session.accountId, startOfToday.toISOString(), endOfToday.toISOString()]
        )
      : query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM visits WHERE account_id = $1 AND assigned_user_id = $2 AND scheduled_start >= $3 AND scheduled_start < $4`,
          [session.accountId, session.userId, startOfToday.toISOString(), endOfToday.toISOString()]
        ),

    isAdmin
      ? query<AmountRow>(
          `SELECT COALESCE(SUM(total_cents - COALESCE(paid_cents, 0)), 0)::text AS amount_cents FROM invoices WHERE account_id = $1 AND status NOT IN ('paid','void')`,
          [session.accountId]
        )
      : Promise.resolve([{ amount_cents: "0" }] as AmountRow[]),

    isAdmin
      ? query<RecentJobRow>(
          `SELECT j.id, j.title, j.status, j.priority, j.created_at, c.name AS client_name
           FROM jobs j LEFT JOIN clients c ON c.id = j.client_id
           WHERE j.account_id = $1
           ORDER BY j.created_at DESC LIMIT 5`,
          [session.accountId]
        )
      : query<RecentJobRow>(
          `SELECT DISTINCT j.id, j.title, j.status, j.priority, j.created_at, c.name AS client_name
           FROM jobs j
           LEFT JOIN clients c ON c.id = j.client_id
           JOIN visits v ON v.job_id = j.id
           WHERE j.account_id = $1 AND v.assigned_user_id = $2
           ORDER BY j.created_at DESC LIMIT 5`,
          [session.accountId, session.userId]
        ),

    isAdmin
      ? query<UpcomingVisitRow>(
          `SELECT v.id, v.scheduled_start, j.title AS job_title, p.address AS property_address
           FROM visits v
           JOIN jobs j ON j.id = v.job_id
           LEFT JOIN properties p ON p.id = j.property_id
           WHERE v.account_id = $1 AND v.status = 'scheduled' AND v.scheduled_start >= $2
           ORDER BY v.scheduled_start ASC LIMIT 5`,
          [session.accountId, now.toISOString()]
        )
      : query<UpcomingVisitRow>(
          `SELECT v.id, v.scheduled_start, j.title AS job_title, p.address AS property_address
           FROM visits v
           JOIN jobs j ON j.id = v.job_id
           LEFT JOIN properties p ON p.id = j.property_id
           WHERE v.account_id = $1 AND v.assigned_user_id = $2 AND v.status = 'scheduled' AND v.scheduled_start >= $3
           ORDER BY v.scheduled_start ASC LIMIT 5`,
          [session.accountId, session.userId, now.toISOString()]
        ),

    // Jobs that are 'completed' but have no invoice yet — ready to bill
    isAdmin
      ? query<ReadyToInvoiceRow>(
          `SELECT j.id, j.title, j.updated_at, c.name AS client_name
           FROM jobs j
           LEFT JOIN clients c ON c.id = j.client_id
           WHERE j.account_id = $1 AND j.status = 'completed'
             AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.account_id = j.account_id)
           ORDER BY j.updated_at DESC
           LIMIT 10`,
          [session.accountId]
        )
      : Promise.resolve([] as ReadyToInvoiceRow[]),

    // Open estimates (draft + sent) + count expiring within 7 days
    isAdmin
      ? query<OpenEstimateRow>(
          `SELECT
             COUNT(*)::text AS count,
             COUNT(*) FILTER (
               WHERE status = 'sent'
                 AND expires_at IS NOT NULL
                 AND expires_at <= NOW() + INTERVAL '7 days'
             )::text AS expiring_soon
           FROM estimates
           WHERE account_id = $1 AND status IN ('draft','sent')`,
          [session.accountId]
        )
      : Promise.resolve([{ count: "0", expiring_soon: "0" }] as OpenEstimateRow[]),
  ]);

  const firstName = (userRows[0]?.full_name ?? "").split(" ")[0] || "there";
  const clientCount = parseInt(clientCountRows[0]?.count || "0", 10);
  const openJobCount = parseInt(openJobCountRows[0]?.count || "0", 10);
  const todayVisitCount = parseInt(todayVisitRows[0]?.count || "0", 10);
  const outstandingCents = parseInt(outstandingRows[0]?.amount_cents || "0", 10);
  const openEstimateCount = parseInt(openEstimateRows[0]?.count || "0", 10);
  const expiringSoonCount = parseInt(openEstimateRows[0]?.expiring_soon || "0", 10);

  const showOnboarding = isAdminOrOwner && clientCount === 0;
  const showNextStep = isAdminOrOwner && clientCount > 0 && openJobCount === 0;

  const metrics: MetricCardData[] = isAdmin
    ? [
        { label: "Clients", value: clientCount, href: "/app/clients" },
        { label: "Open Jobs", value: openJobCount, href: "/app/jobs" },
        { label: "Today's Visits", value: todayVisitCount, href: "/app/visits" },
        {
          label: "Outstanding",
          value: formatCurrency(outstandingCents),
          href: "/app/invoices",
          variant: (outstandingCents > 0 ? "alert" : "default") as MetricCardData["variant"],
        },
        {
          label: "Open Estimates",
          value: openEstimateCount,
          href: "/app/estimates",
          sub: expiringSoonCount > 0 ? `${expiringSoonCount} expiring soon` : undefined,
          variant: (expiringSoonCount > 0 ? "alert" : "default") as MetricCardData["variant"],
        },
      ]
    : [
        { label: "My Active Jobs", value: openJobCount, href: "/app/jobs" },
        { label: "Today's Visits", value: todayVisitCount, href: "/app/visits" },
      ];

  return (
    <PageContainer>
      {/* Greeting */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-1)" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--fg)" }}>
            {getGreeting()}, {firstName}
          </h1>
          <RoleBadge variant={session.role as "owner" | "admin" | "tech"}>
            {session.role}
          </RoleBadge>
        </div>
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {isAdmin ? "Here's what's happening with your business today." : "Here's your work for today."}
        </p>
      </div>

      {/* Onboarding — no clients yet */}
      {showOnboarding && (
        <Card style={{ marginBottom: "var(--space-6)", borderLeft: "4px solid var(--accent)" }}>
          <div style={{ padding: "var(--space-5)" }}>
            <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
              Welcome to FieldSync!
            </h2>
            <p style={{ margin: "0 0 var(--space-5)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
              Follow these steps to start managing your field service business.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <StepDot n={1} active />
                <span style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", flex: 1 }}>
                  Add your first client
                </span>
                <LinkButton href="/app/clients/new" variant="primary" size="sm">
                  + New Client
                </LinkButton>
              </div>
              {["Add a property for that client", "Create your first job", "Schedule a visit"].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", opacity: 0.4 }}>
                  <StepDot n={i + 2} active={false} />
                  <span style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Next step — clients exist but no open jobs */}
      {showNextStep && (
        <Card style={{ marginBottom: "var(--space-6)", borderLeft: "4px solid var(--accent)" }}>
          <div style={{ padding: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)" }}>
                Your clients are set up. Create your first job to start tracking work.
              </p>
            </div>
            <LinkButton href="/app/jobs/new" variant="primary" size="sm">
              + New Job
            </LinkButton>
          </div>
        </Card>
      )}

      {/* Metrics */}
      <MetricGrid metrics={metrics} />

      {/* Quick Actions */}
      {isAdminOrOwner && (
        <div style={{ marginTop: "var(--space-6)" }}>
          <SectionHeader title="Quick Actions" as="h2" />
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "var(--space-3)",
            marginTop: "var(--space-3)",
          }}>
            <QuickActionCard href="/app/clients/new" icon="👤" label="New Client" />
            <QuickActionCard href="/app/jobs/new" icon="📋" label="New Job" />
            <QuickActionCard href="/app/visits" icon="📅" label="Schedule" />
            <QuickActionCard href="/app/invoices" icon="💰" label="Invoices" />
          </div>
        </div>
      )}

      {/* Ready to Invoice */}
      {isAdmin && readyToInvoice.length > 0 && (
        <div style={{ marginTop: "var(--space-8)" }}>
          <SectionHeader
            title="Ready to Invoice"
            count={readyToInvoice.length}
            as="h2"
            action={
              <Link href="/app/invoices" style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>
                All invoices →
              </Link>
            }
          />
          <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {readyToInvoice.map((job) => (
              <Link key={job.id} href={`/app/jobs/${job.id}` as Route} style={{ textDecoration: "none" }}>
                <Card hover padding="sm" style={{ borderLeft: "3px solid var(--accent)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {job.title}
                      </div>
                      {job.client_name && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "2px" }}>
                          {job.client_name}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: "var(--accent)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      Invoice →
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Jobs + Upcoming Visits */}
      {(recentJobs.length > 0 || upcomingVisits.length > 0) && (
        <div style={{
          marginTop: "var(--space-8)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-6)",
        }}>
          {/* Recent Jobs */}
          <div>
            <SectionHeader
              title="Recent Jobs"
              count={recentJobs.length}
              action={
                <Link href="/app/jobs" style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>
                  View all →
                </Link>
              }
              as="h2"
            />
            <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {recentJobs.map((job) => {
                const pv: PriorityVariant | null = priorityNumToVariant(job.priority);
                const pl = priorityLabel(job.priority);
                return (
                  <Link key={job.id} href={`/app/jobs/${job.id}` as Route} style={{ textDecoration: "none" }}>
                    <Card hover padding="sm">
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", justifyContent: "space-between" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {job.title}
                          </div>
                          {job.client_name && (
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "2px" }}>
                              {job.client_name}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1)", flexShrink: 0 }}>
                          <StatusBadge variant={job.status as StatusVariant}>
                            {JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}
                          </StatusBadge>
                          {pv && <PriorityBadge variant={pv}>{pl}</PriorityBadge>}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Upcoming Visits */}
          <div>
            <SectionHeader
              title="Upcoming Visits"
              count={upcomingVisits.length}
              action={
                <Link href="/app/visits" style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>
                  View all →
                </Link>
              }
              as="h2"
            />
            <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {upcomingVisits.length === 0 ? (
                <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                  No upcoming visits scheduled
                </div>
              ) : (
                upcomingVisits.map((visit) => {
                  const d = new Date(visit.scheduled_start);
                  return (
                    <Link key={visit.id} href={`/app/visits/${visit.id}` as Route} style={{ textDecoration: "none" }}>
                      <Card hover padding="sm">
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {visit.job_title}
                            </div>
                            {visit.property_address && (
                              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "2px" }}>
                                {visit.property_address}
                              </div>
                            )}
                          </div>
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: "var(--fg)" }}>
                              {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                              {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function StepDot({ n, active }: { n: number; active: boolean }) {
  return (
    <span style={{
      width: 28,
      height: 28,
      borderRadius: "50%",
      background: active ? "var(--accent)" : "var(--border)",
      color: active ? "#fff" : "var(--fg-muted)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--font-bold)",
      flexShrink: 0,
    }}>
      {n}
    </span>
  );
}

function QuickActionCard({ href, icon, label }: { href: Route; icon: string; label: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <Card hover padding="default" style={{ textAlign: "center", cursor: "pointer" }}>
        <div style={{ fontSize: "1.5rem", marginBottom: "var(--space-2)", lineHeight: 1 }}>{icon}</div>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--fg)" }}>{label}</div>
      </Card>
    </Link>
  );
}
