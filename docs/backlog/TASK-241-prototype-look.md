# TASK-241: The app wears the prototype's look

Status:
Proposed

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. Every screen feels like generic software instead of Dovetails.

Problem:
`styles/brand.css` defines the Dovetails colors (navy `#13263c`, orange `#d2672a`, cream
`#f6f3ee`), but `styles/tokens.css` builds screens from cool stone greys on near-white
(`--bg: slate-50`). Money uses the body font, so amounts don't line up. The owner prefers
the prototype's look (UX direction section 32).

Scope:
- `tokens.css` semantic colors: page background cream, sidebar navy, primary orange,
  card border warm, using the brand values.
- DM Mono (via `next/font`) for money amounts, counts and ID numbers; a `.money` /
  `--font-mono` token used by the shared money formatter's components.
- Body font: try DM Sans against Archivo on three screens; owner picks.
- Dark mode, status colors and contrast still pass (orange text on white ≥ 4.5:1 for small text).

Out of scope:
- Layout changes on any page (TASK-242 to TASK-245).
- Customer-facing PDFs and portal (follow-up if the owner wants them to match).

Acceptance Criteria:
- [ ] Today, a job, a property and an estimate use cream, navy and orange from the brand values.
- [ ] Every dollar amount in those four screens uses the mono font.
- [ ] No raw hex added in components; only tokens change.
- [ ] Contrast check passes for text and buttons.

Test Plan:
- Screenshot before and after of the four screens on phone and laptop, next to the prototype.
- Existing unit and e2e tests pass unchanged.

Related:
UX direction section 32. TASK-235 (shop words), TASK-237 (menu).
