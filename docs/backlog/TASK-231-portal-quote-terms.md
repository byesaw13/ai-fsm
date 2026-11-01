# TASK-231: The customer quote page shows the quote terms

Status:
In progress (PR open 2026-11-01)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-230 (deposit to book). Its Scope left the portal terms out.

Problem:
Owner, 2026-11-01, asked to add the terms to the customer page. The PDF and
print copy carry Settings → Company "Estimate terms" (with `{deposit_percent}`
filled in, e.g. "A 30% deposit is required to book your project."). The
customer page at /portal/estimates/[token] showed no terms, so a customer who
only opens the link never reads them.

Scope:
- The portal quote page shows a "Quote terms" box with the same text the print
  copy uses (`customerQuoteTerms` in `lib/estimates/customer-quote.ts`, built on
  `resolveCompanyBranding`).
- The separate deposit terms show under it only when the quote has a deposit,
  as on the print copy. An empty `deposit_terms` hides them.

Acceptance Criteria:
- [ ] The Dowd quote page shows "A 30% deposit is required to book your project."
- [ ] Unit tests cover the placeholder, the deposit-only rule and the fallback.

Related:
TASK-230.
