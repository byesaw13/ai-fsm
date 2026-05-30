import { notFound } from "next/navigation";
import { getPool } from "@/lib/db";
import { IntakeClientForm } from "./IntakeClientForm";

export const dynamic = "force-dynamic";

interface InviteRow {
  id: string;
  account_id: string;
  booking_request_id: string | null;
  token: string;
  lead_name: string;
  lead_email: string;
  lead_phone: string | null;
  expires_at: string;
  used_at: string | null;
}

export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let rows: InviteRow[] = [];
  try {
    const pool = getPool();
    const result = await pool.query<InviteRow>(
      `SELECT id, account_id, booking_request_id, token::text AS token,
              lead_name, lead_email, lead_phone, expires_at, used_at
       FROM intake_invites
       WHERE token = $1`,
      [token]
    );
    rows = result.rows;
  } catch {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Something went wrong</h1>
        <p style={bodyStyle}>
          We couldn&apos;t load your intake form right now. Please try again in a moment,
          or contact Dovetails Services directly.
        </p>
      </div>
    );
  }

  const invite = rows[0];
  if (!invite) return notFound();

  if (invite.used_at) {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Already submitted</h1>
        <p style={bodyStyle}>
          This intake form has already been completed. We have your information and will be in touch soon.
        </p>
        <p style={mutedStyle}>
          Questions? Reply to the email we sent you or call us directly.
        </p>
      </div>
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Link expired</h1>
        <p style={bodyStyle}>
          This intake form link expired after 48 hours. Please contact Dovetails Services to request a new link.
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={headingStyle}>Tell us about your project</h1>
        <p style={bodyStyle}>
          Hi {invite.lead_name}! Fill out a few details below so we can put together an accurate estimate for you.
          It only takes a couple of minutes.
        </p>
      </div>
      <IntakeClientForm
        token={invite.token}
        leadName={invite.lead_name}
        leadEmail={invite.lead_email}
        leadPhone={invite.lead_phone ?? ""}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "40px auto",
  padding: "0 16px",
  fontFamily: "system-ui, sans-serif",
  color: "#18181b",
};

const headingStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  margin: "0 0 12px",
};

const bodyStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#52525b",
  lineHeight: 1.6,
  margin: "0 0 8px",
};

const mutedStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#71717a",
  margin: "8px 0 0",
};
