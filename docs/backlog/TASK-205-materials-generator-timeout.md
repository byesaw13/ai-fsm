# TASK-205: Materials generator finishes within the tunnel limit

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium (owner saw "Network error" on 2026-10-26).

Problem:
`/api/v1/estimates/ai-materials` waits for one non-streaming Sonnet call of up
to 8,192 output tokens. Large scopes can pass Cloudflare's 100 s limit; the
browser gets Cloudflare's page and `MaterialsGenerator.tsx` shows "Network
error". The assessment hand-off (`AssessmentForm.tsx`, onAddToEstimate) sends
generated items to a new estimate as untyped lines, saved as labor.

Scope:
- Stream the response (or run as a job the page polls) so no request waits
  over 100 s.
- Hand-off lines carry line_item_type materials.

Out of Scope:
Itemized materials per work area on prepared quotes (shipped in TASK-187).

Acceptance Criteria:
- [ ] A whole-house scope that takes 150 s to generate completes in the
      browser.
- [ ] Items handed from the assessment save as materials lines.
