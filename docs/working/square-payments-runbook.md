# Square Payments — Setup & Operations Runbook

How to connect Square so clients can pay invoices by card, how it works
end-to-end, and how to troubleshoot. Square is the card processor; Dovetails OS
remains the source of truth for invoices, balances, and payment history. Manual
payment recording (Venmo, cash, check, Zelle, ACH) works whether or not Square
is connected. (Stripe was archived in favour of Square — see EPIC-004 TASK-069.)

## Architecture in one paragraph

The owner stores Square credentials in **Settings → Payments — Square**. They are
encrypted at rest (AES-256-GCM) with a key from `APP_ENCRYPTION_KEY` and saved in
the `integration_settings` table. An invoice action (or the client portal)
creates a **Square-hosted payment link** for an amount and records a `pending`
row in `payments`. When the customer pays, Square calls
`POST /api/webhooks/square`; the handler verifies the HMAC signature, marks the
pending payment `paid`, and a DB trigger updates the invoice's
`paid_cents`/`status`. Refunds issued in Square arrive as `refund.*` events and
are recorded as ledger-only `refunded` rows.

## One-time server setup

1. **Set the encryption key** (required to store Square secrets). Generate once
   and keep it stable — if it changes, stored secrets can't be decrypted.
   ```bash
   openssl rand -base64 32
   ```
   Add to the web app's environment (production: the env feeding
   `infra/compose.garonhome.yml`):
   ```
   APP_ENCRYPTION_KEY=<the generated value>
   ```
   Restart the web container. Confirm in **Settings → System Health** that
   "Square Payments" shows **Ready**.

2. (Optional) `SQUARE_WEBHOOK_URL` — only needed as a fallback if you leave the
   Webhook URL blank in Settings. Normally set it in Settings instead.

## Getting Square credentials

All from the Square Developer Dashboard: https://developer.squareup.com/apps
(create an application). Each environment (Sandbox / Production) has its own set.

| Value | Where |
|---|---|
| Application ID | App → Credentials (`sandbox-sq0idb-…` / `sq0idp-…`) |
| Access Token | App → Credentials (toggle Sandbox/Production) |
| Location ID | App → Locations (or Square Dashboard → Business → Locations), e.g. `L1A2B3C4D5E6F` |
| Webhook Signature Key | App → Webhooks → Subscriptions (after adding the endpoint) |
| Webhook URL | Yours: `https://<public-host>/api/webhooks/square` |

## Connecting Square in the app (owner only)

1. **Settings → Payments — Square.**
2. Choose **Environment** (start with Sandbox).
3. Enter **Location ID** and **Application ID**.
4. Paste the **Access Token** (write-only; shows as saved afterwards).
5. **Save**, then click **Test connection** — it should turn green
   ("Connected — N location(s)").
6. In Square → Webhooks → **Add endpoint**:
   - URL: `https://<public-host>/api/webhooks/square`
   - Events: `payment.created`, `payment.updated`, `refund.created`,
     `refund.updated`
   - Copy the generated **Signature key** into the panel's *Webhook Signature
     Key* field, and put the same **URL** into the *Webhook URL* field. Save.
7. Toggle **Enable Square card payments** on and Save.

The public host must be reachable by Square (e.g. via the Cloudflare Tunnel).

## Taking a payment

- **Owner-initiated:** open an invoice → **Square Payment Link** → choose
  Deposit / Remaining balance / Custom → **Create Square Link** → Copy and send
  to the client. A `pending` payment is recorded immediately.
- **Client self-service:** on the shared invoice portal link, the client clicks
  **Pay … by card** and is redirected to Square's hosted checkout.

When payment completes, the webhook marks the invoice paid/partial automatically.

## Sandbox end-to-end test

1. Connect with **Sandbox** credentials; Test connection green.
2. Create a payment link on a test invoice.
3. Open the link and pay with a Square sandbox test card
   (https://developer.squareup.com/docs/devtools/sandbox/payments).
4. Confirm: the invoice flips to paid/partial, a payment row appears in history
   with method `square`, and a timeline entry shows the payment.
5. Issue a refund in the Square sandbox dashboard; confirm a `refunded` row
   appears (it does **not** reduce `paid_cents` — refunds are ledger entries).

Then repeat steps 1–4 with **Production** credentials before going live.

## How it maps in the database

- `integration_settings` — one row per account (`provider='square'`);
  `config` jsonb holds location/application IDs + webhook URL; `secrets` is the
  encrypted blob. RLS: owner+admin read, owner-only write.
- `payments` — `external_provider='square'`, `external_payment_id` = Square
  payment id (or refund id). `status`: `pending` → `paid` (or `refunded`).
  Idempotency via the unique index on `(external_provider, external_payment_id)`.
- `invoices.square_order_id / square_checkout_id / square_payment_link_url` —
  references for matching webhooks and reusing links.
- Only `status='paid'` rows count toward `invoices.paid_cents` (the
  `sync_invoice_on_payment` trigger).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Can't save Square settings (412) | `APP_ENCRYPTION_KEY` not set on the server. |
| Test connection fails "Unauthorized" | Wrong/blank access token, or token from the other environment. |
| Test connection "location not found" | Location ID belongs to a different environment/account. |
| Paid in Square but invoice not updated | Webhook not delivered or signature mismatch. Check the **Webhook URL** in Settings exactly equals the Square subscription URL; confirm the signature key matches; check web logs for "signature verification failed". |
| Webhook 400 "Webhook not configured" | Signature key missing in Settings. |
| Duplicate payment worry | Safe — idempotent on `(external_provider, external_payment_id)`. |
| Refund in Square not reflected | Ensure `refund.created`/`refund.updated` are subscribed; refunds appear as `refunded` rows, not as a reduction of paid total. |

## Known limitations (follow-ups)

- Creating multiple links for one invoice leaves multiple `pending` rows (no
  auto-expire/replace).
- Square is link/redirect based (hosted checkout), not an embedded card field.
- No payment-by-method reporting yet (EPIC-004 backlog item 8).
