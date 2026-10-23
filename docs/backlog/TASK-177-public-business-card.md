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
- Saving any of those fields on the public account (`BOOKING_ACCOUNT_ID`) commits `src/data/business-card.json` on `byesaw13/mydovetails-site` master. Another account's save does not. The publisher reloads the saved card while it holds its turn, so an older save cannot overwrite a newer one. That push runs the existing Pages deploy. Off unless `SITE_REBUILD_GITHUB_TOKEN` is set (Contents read/write). The build reads the file. It does not fetch the app, because Cloudflare returns 403 to GitHub Actions. The site keeps its built-in values only when that file is missing or invalid.

Services and page copy stay in the site repo.

## Acceptance criteria

- Owner edits and saves; the toast says whether the website rebuild started.
- The public endpoint returns the card fields and nothing else.
- With the token set, mydovetails.com and /card show the new values within a few minutes.
- Unit tests cover fallbacks, phone normalization, badge limits, and publishing the card file.

## Deploy steps

1. Create a fine-grained GitHub token: repository `byesaw13/mydovetails-site`, permission Contents read/write. Put it in the garonhome env as `SITE_REBUILD_GITHUB_TOKEN` and redeploy the web app.
2. Merge the site change that reads `src/data/business-card.json`.
