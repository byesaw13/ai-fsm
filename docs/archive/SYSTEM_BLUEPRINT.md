# SYSTEM BLUEPRINT

## Architecture
- Frontend: Next.js app router
- Backend: API service (TypeScript) with domain service layer
- Database: PostgreSQL + SQL migrations + RLS policies
- Worker: queue/poll worker for automations
- Cache/queue: Redis

## Bounded Contexts
1. Identity & Access
2. CRM (clients/properties)
3. Operations (jobs/visits)
4. Finance (estimates/invoices/payments)
5. Automation
6. Platform (audit, monitoring, backups)

## Data Rules
- Single canonical schema
- Additive migrations only
- Explicit status enums
- Immutable financial snapshots when converting estimate->invoice

## Security Rules
- JWT or session with role claims
- DB session context set per request for RLS checks
- No bypass around policy layer

## Deployment Targets
1. Dev workstation via compose.dev
2. VPS production via compose.prod
3. Pi4 production-lite via compose.pi
