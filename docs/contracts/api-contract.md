# API Contract

## Base Principles
- Versioned API: `/api/v1`
- JSON only
- Typed request/response schemas
- Error model: `{ code, message, details?, traceId }`

## Required Modules
- auth
- clients/properties
- jobs/visits
- estimates/invoices/payments
- automations
- audit
