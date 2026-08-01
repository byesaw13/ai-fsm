import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import {
  BUSINESS_LEGAL_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_SUPPORT_EMAIL,
} from "@/lib/sms/consent";

export const metadata: Metadata = {
  title: "Privacy Policy — Dovetails",
  description:
    "Privacy Policy for Dovetails Services LLC, including how we handle SMS/text messaging and personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" effectiveDate="August 1, 2026">
      <p>
        {BUSINESS_LEGAL_NAME} (“Dovetails,” “we,” “us,” or “our”) respects your privacy. This
        Privacy Policy explains what information we collect, how we use it, and your choices —
        including choices about text messages (SMS).
      </p>

      <h2>1. Information we collect</h2>
      <p>We may collect:</p>
      <ul>
        <li>
          <strong>Contact details</strong> you provide — name, phone number, email address, and
          service address.
        </li>
        <li>
          <strong>Service details</strong> — project descriptions, preferences, photos you share,
          appointment history, estimates, and invoices related to your jobs.
        </li>
        <li>
          <strong>Communications</strong> — messages you send us by SMS, email, or our web forms,
          and records of consent for texting.
        </li>
        <li>
          <strong>Technical data</strong> — basic device and browser information when you use our
          website or customer portal (for security and reliability).
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Schedule, estimate, perform, and bill for home service work</li>
        <li>
          Send service-related communications (including SMS when you have opted in) such as
          appointment confirmations, reminders, estimate links, invoice notices, and replies to
          your messages
        </li>
        <li>Improve our services and keep records required for business operations</li>
        <li>Comply with law and protect against fraud or abuse</li>
      </ul>

      <h2>3. Text messaging (SMS)</h2>
      <p>
        If you opt in to SMS (for example on our{" "}
        <Link href="/booking">online booking form</Link> or during staff intake), we may send you
        informational texts about your service requests, appointments, estimates, and related
        account updates. Message frequency varies based on your project activity. Message and data
        rates may apply.
      </p>
      <ul>
        <li>
          <strong>Opt out:</strong> Reply <strong>STOP</strong> to any message (or use STOPALL,
          UNSUBSCRIBE, CANCEL, END, or QUIT). We will confirm and stop further marketing/service
          texts to that number.
        </li>
        <li>
          <strong>Help:</strong> Reply <strong>HELP</strong> for assistance, or call{" "}
          {BUSINESS_PHONE_DISPLAY} / email {BUSINESS_SUPPORT_EMAIL}.
        </li>
        <li>
          <strong>Re-subscribe:</strong> After opting out, reply <strong>START</strong> if you want
          service texts again.
        </li>
      </ul>
      <p>
        <strong>We do not sell, rent, or share your mobile phone number or SMS opt-in data with
        third parties or affiliates for their marketing or promotional purposes.</strong>{" "}
        Carriers and our messaging providers may process messages solely to deliver the service.
        We may use service providers (hosting, communications tools) under contracts that limit use
        of your data to providing services for us.
      </p>

      <h2>4. Sharing of information</h2>
      <p>We may share information with:</p>
      <ul>
        <li>Service providers who help us operate (hosting, email/SMS delivery, payments)</li>
        <li>Payment processors when you pay an invoice</li>
        <li>Professional advisors or authorities when required by law</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>5. Data retention</h2>
      <p>
        We keep service, billing, and communication records for as long as needed for the purposes
        above, including legal, tax, and warranty-related needs, then delete or anonymize when no
        longer required.
      </p>

      <h2>6. Security</h2>
      <p>
        We use reasonable administrative and technical safeguards to protect information. No method
        of transmission or storage is 100% secure.
      </p>

      <h2>7. Your choices</h2>
      <ul>
        <li>Update contact preferences by contacting us or replying STOP to SMS</li>
        <li>Request access or correction of your information by emailing us</li>
        <li>Close your customer portal account access by contacting us</li>
      </ul>

      <h2>8. Children</h2>
      <p>
        Our services are directed to adults arranging property maintenance and related work. We do
        not knowingly collect information from children under 13.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. The effective date at the top will
        change when we do. Continued use of our services after an update constitutes acceptance of
        the revised policy.
      </p>

      <h2>10. Contact</h2>
      <p>
        {BUSINESS_LEGAL_NAME}
        <br />
        Phone: {BUSINESS_PHONE_DISPLAY}
        <br />
        Email:{" "}
        <a href={`mailto:${BUSINESS_SUPPORT_EMAIL}`}>{BUSINESS_SUPPORT_EMAIL}</a>
      </p>
      <p>
        Related: <Link href={"/terms" as Route}>Terms of Service</Link>
      </p>
    </LegalPageShell>
  );
}
