# TASK-130: Findability — lightweight "what can I do here?" command search

Status:
Done

Phase:
2

Problem:
A5. Capabilities exist but are undiscoverable across 50+ pages. No in-app
search of destinations.

Business Value:
A new tech (or Nick on a phone) can find a named capability in seconds via
Find / Ctrl+K instead of hunting hubs.

Scope:
- Command palette over existing routes (`quick-actions.ts` + hub links).
- Ctrl/⌘K and a Find button in the shell. Role-filtered. No new module.

Out of Scope:
- Global record search (clients/jobs by name). New destinations.

Acceptance Criteria:
- [x] Ctrl/⌘K opens a filterable list of existing app destinations.
- [x] Techs do not see owner-only money/office routes.

