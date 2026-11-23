import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { PageContainer, PageHeader } from "@/components/ui";
import { QuickEstimateWizard } from "./QuickEstimateWizard";

export const dynamic = "force-dynamic";

interface Client extends Record<string, unknown> {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface Service extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  category: string;
  price_min_cents: number;
  price_max_cents: number | null;
  default_price_cents: number | null;
  description: string | null;
}

// Common handyman jobs surfaced first in the quick flow. Codes map to the
// seeded price book (migration 018). These are the fastest-to-quote jobs.
const FEATURED_CODES = [
  "2001", // Faucet replacement
  "2005", // Toilet replacement
  "3002", // Ceiling fan installation
  "7001", // TV mounting
  "1001", // Drywall patch <=6"
  "3001", // Light fixture replacement
  "2002", // Showerhead replacement
  "1007", // Door hardware replacement
  "3003", // Outlet/switch replacement
  "6001", // Gutter cleaning
];

interface PageProps {
  searchParams: Promise<{ client_id?: string }>;
}

export default async function QuickEstimatePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app/estimates");

  const { client_id } = await searchParams;

  const [clients, services] = await Promise.all([
    query<Client>(
      `SELECT id, name, phone, email FROM clients WHERE account_id = $1 ORDER BY name ASC`,
      [session.accountId]
    ),
    // Price book is global (not per-account); pull active services.
    query<Service>(
      `SELECT id, code, name, category, price_min_cents, price_max_cents,
              default_price_cents, description
       FROM price_book
       WHERE is_active = true
       ORDER BY code ASC`,
      []
    ),
  ]);

  // Order featured services first (in FEATURED_CODES order), then the rest.
  const byCode = new Map(services.map((s) => [s.code, s]));
  const featured = FEATURED_CODES.map((c) => byCode.get(c)).filter((s): s is Service => !!s);
  const featuredCodeSet = new Set(FEATURED_CODES);
  const rest = services.filter((s) => !featuredCodeSet.has(s.code));
  const orderedServices = [...featured, ...rest];

  return (
    <PageContainer>
      <PageHeader title="Quick Estimate" backHref="/app/estimates" backLabel="Estimates" />
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <QuickEstimateWizard
          clients={clients}
          featuredServices={orderedServices}
          initialClientId={client_id}
        />
      </div>
    </PageContainer>
  );
}
