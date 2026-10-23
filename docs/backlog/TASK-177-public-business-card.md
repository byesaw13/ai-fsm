# TASK-177 — Edit the website contact info and business card from the app

- Phase: cross-cutting
- Epic: 005 — Platform and delivery
- Status: In progress
- Source: Nick, 2026-10-21, after mydovetails.com/card shipped (site commit f482d7e).

## Objective

Nick changes his phone, email, name, title, location, and card badges in one place he already logs into, and mydovetails.com, the /card page, and the contact people save from it all follow. Estimates and invoices print the same phone and email.

## Scope

- Settings → Company gets a "Website & business card" section (owner/admin only). Phone and email are the existing `company_phone` / `company_email` account settings that the document letterhead already reads; the other fields are new `card_*` keys in `accounts.settings`. The card can carry its own email (`card_email`, e.g. Nick's own inbox) while the website and documents keep the business email; blank means the business email. The public phone is always shown as (603) 479-1094 style. No migration.
- `GET /api/public/business-card` returns only those fields for the public account (`BOOKING_ACCOUNT_ID`). Nothing else in account settings is exposed. Empty fields fall back to what the site showed before; a phone that is not a dialable US number falls back so the call and text buttons never break.
- Saving any of those fields sends a GitHub `repository_dispatch` (`business-card-updated`) to `byesaw13/mydovetails-site`, whose deploy workflow rebuilds the site. Off unless `SITE_REBUILD_GITHUB_TOKEN` is set.
- The site reads the endpoint at build time and keeps its built-in values if the app is unreachable, so a site build never fails because of the app.

Services and page copy stay in the site repo.

## Acceptance criteria

- Owner edits and saves; the toast says whether the website rebuild started.
- The public endpoint returns the card fields and nothing else.
- With the token set, mydovetails.com and /card show the new values within a few minutes.
- Unit tests cover fallbacks, phone normalization, badge limits, and the dispatch call.

## Deploy steps

1. Create a fine-grained GitHub token: repository `byesaw13/mydovetails-site`, permission Contents read/write. Put it in the garonhome env as `SITE_REBUILD_GITHUB_TOKEN` and redeploy the web app.
2. Merge the site change that reads the endpoint and listens for `business-card-updated`.
