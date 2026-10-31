# TASK-226: New letterhead on invoices and customer PDFs

Status:
In Progress

Epic:
EPIC-004 Billing & Profitability

Phase:
3 (ROADMAP Phase 3 slice "customer quote presentation and letterhead", owner 2026-10-31)

Owner decisions (session 2026-10-31):
- "change the letterhead of the invoice to the new one that is in the mydovetails-site repo"
- "take out the address on the letterhead as it is my home address. if it needs one you can use the 84
  broadway one that is my registered agent"

Problem:
- The documents use the old round dove logo (`logo-e680679f.png`, uploaded July 2026).
- The letterhead prints `company_address` "85R Rockingham Rd Derry, NH 03038", which is the owner's home.
- The new brand is the house-and-dove horizontal lockup in `mydovetails-site/public/brand/`
  (`png/dovetails-horizontal-color-1200.png`, 1200×315). It already contains the words
  "DOVETAILS HOME SERVICES".
- The PDF and the invoice print page draw the logo at most 140×48 / 160×56 and print the company name
  next to it. With the new lockup the name would appear twice and the logo would be tiny.

Scope:
- Branding learns the logo's shape. `resolveCompanyBranding` reports `logoIsWordmark` when the PNG is
  at least 2.5 times wider than tall (read from the PNG header). A JPEG or an unreadable file counts as
  not a wordmark.
- With a wordmark logo:
  - The PDF draws it up to 220×58 pt and does not print the company name text.
  - Tagline, website, phone and email go under it.
  - The invoice print page does the same: logo up to 260×68 px, no company-name line.
- A square logo keeps today's layout.
- The estimate print page gets the same logo header as the invoice print page. Today it has no logo.
- Data (owner-approved here):
  - Upload the horizontal color PNG as the account logo. Use the Settings logo upload, or copy it into
    `/app/uploads/account/<id>/` and update `logo_filename`.
  - Clear `company_address`. The letterhead doesn't need one.
  - If the owner later wants an address, use the registered agent at 84 Broadway (the owner supplies the
    town and ZIP).

Out of scope:
- Email templates and the portal header (they don't show the address or logo today).
- The business card (TASK-177) keeps its own settings.

Acceptance Criteria:
- [ ] Unit tests: wordmark detection on a 1200×315 PNG, a 170×170 PNG and a JPEG.
- [ ] The PDF test renders with a wordmark logo and does not draw the company name text.
- [ ] After deploy, the production account logo is the new lockup and `company_address` is empty. The
      invoice PDF of a recent invoice is checked by eye.

Effort:
0.5 d
