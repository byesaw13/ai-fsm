# Architecture

## Runtime Model
- Web app: Next.js (admin + tech views)
- Database: PostgreSQL
- Queue/cache: Redis
- Worker: Node-based polling/queue consumer

## Modules
1. Jobs: lifecycle and ownership
2. Visits: schedule/assign/complete
3. Estimates: draft/send/approve/decline
4. Invoices: generate/send/record payments
5. Automations: reminders and follow-ups

## Cross-Cutting
- Auth: email/password with roles (owner/admin/tech)
- Audit logs for status changes
- Backups via scheduled pg_dump

## Deployment
- Development: `infra/compose.dev.yml`
- Raspberry Pi: `infra/compose.pi.yml` with ARM64 images and memory limits
