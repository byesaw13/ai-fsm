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
  title: "Terms of Service — Dovetails",
  description:
    "Terms of Service for Dovetails Services LLC, including website use and SMS program terms.",
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" effectiveDate="August 1, 2026">
      <p>
        These Terms of Service (“Terms”) govern your use of websites, booking forms, customer
        portals, and related services operated by {BUSINESS_LEGAL_NAME} (“Dovetails,” “we,” “us”).
        By using our services or submitting a service request, you agree to these Terms.
      </p>

      <h2>1. Who we are</h2>
      <p>
        {BUSINESS_LEGAL_NAME} provides residential and light commercial handyman, carpentry,
        painting, and related home services in our service area. Contact: {BUSINESS_PHONE_DISPLAY}{" "}
        or {BUSINESS_SUPPORT_EMAIL}.
      </p>

      <h2>2. Service requests and estimates</h2>
      <ul>
        <li>
          Submitting a booking or intake form is a <strong>request for contact</strong>, not a
          binding contract for work until we agree on scope, price, and schedule (typically via a
          written estimate you approve).
        </li>
        <li>
          Estimates, timelines, and availability are good-faith approximations and may change after
          site inspection or discovery of additional work.
        </li>
        <li>
          Work proceeds under the terms of the approved estimate, change orders, and any separate
          written agreement.
        </li>
      </ul>

      <h2>3. Website and portal use</h2>
      <ul>
        <li>Provide accurate contact and property information.</li>
        <li>
          Do not misuse our systems (spam, scraping, unauthorized access, or interference with
          others’ use).
        </li>
        <li>
          Portal and estimate links are personal; do not share login or token links in public
          channels.
        </li>
      </ul>

      <h2>4. SMS / text messaging program</h2>
      <p>
        By opting in to SMS (checkbox on our forms or other clear affirmative consent), you agree
        to receive automated and/or person-to-person text messages from {BUSINESS_LEGAL_NAME} at
        the mobile number you provide. Messages may include:
      </p>
      <ul>
        <li>Service request acknowledgments and follow-ups</li>
        <li>Appointment scheduling, confirmations, and reminders</li>
        <li>Estimate and invoice notifications and links</li>
        <li>Replies to questions you text to our business line</li>
      </ul>
      <p>
        <strong>Message frequency varies</strong> depending on your project and account activity.
        <strong> Message and data rates may apply.</strong> Carriers are not liable for delayed or
        undelivered messages.
      </p>
      <p>
        <strong>Opt out:</strong> Reply <strong>STOP</strong> (or STOPALL, UNSUBSCRIBE, CANCEL,
        END, QUIT) to cancel. You will receive a one-time confirmation and we will stop sending
        further program messages to that number.
      </p>
      <p>
        <strong>Help:</strong> Reply <strong>HELP</strong> for help, or contact us at{" "}
        {BUSINESS_PHONE_DISPLAY} / {BUSINESS_SUPPORT_EMAIL}.
      </p>
      <p>
        <strong>Re-subscribe:</strong> Reply <strong>START</strong> after opting out if you wish to
        receive service texts again.
      </p>
      <p>
        Consent to SMS is not a condition of purchasing goods or services. You may choose phone or
        email as your preferred contact method. Details on how we handle personal data are in our{" "}
        <Link href={"/privacy" as Route}>Privacy Policy</Link>.
      </p>

      <h2>5. Payments</h2>
      <p>
        When we invoice you, payment terms on the invoice apply. Card payments may be processed by
        third-party processors (for example Square). We do not store full card numbers on our
        systems when using those processors.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        Site content, branding, and software interfaces are owned by Dovetails or our licensors.
        You may not copy or reuse them except as needed to use our services.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        Our websites and messaging tools are provided “as is.” We do not warrant uninterrupted or
        error-free operation. To the fullest extent permitted by law, we disclaim implied
        warranties of merchantability and fitness for a particular purpose regarding the website
        and messaging features. Warranties for physical work, if any, are stated in your estimate
        or separate agreement.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {BUSINESS_LEGAL_NAME} is not liable for indirect,
        incidental, special, or consequential damages arising from website use or messaging
        delivery failures. Our total liability for website/messaging claims is limited to the
        greater of $100 or amounts you paid us for the related service in the prior 12 months.
        Nothing here limits liability that cannot be limited under applicable law.
      </p>

      <h2>9. Indemnity</h2>
      <p>
        You agree to indemnify and hold us harmless from claims arising out of your misuse of the
        site, false information you submit, or violation of these Terms.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of New Hampshire, without regard to
        conflict-of-law rules. Venue for disputes is in courts located in New Hampshire, unless
        applicable consumer law requires otherwise.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms by posting a new version with a revised effective date. Material
        changes to the SMS program will be reflected here and, where required, through updated
        consent language on our forms.
      </p>

      <h2>12. Contact</h2>
      <p>
        {BUSINESS_LEGAL_NAME}
        <br />
        Phone: {BUSINESS_PHONE_DISPLAY}
        <br />
        Email:{" "}
        <a href={`mailto:${BUSINESS_SUPPORT_EMAIL}`}>{BUSINESS_SUPPORT_EMAIL}</a>
      </p>
      <p>
        Related: <Link href={"/privacy" as Route}>Privacy Policy</Link>
      </p>
    </LegalPageShell>
  );
}
