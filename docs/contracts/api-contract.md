# API Contract (FROZEN)

> Status: **FROZEN** as of 2026-02-16 — P0-T2
> Any changes require ADR entry in `docs/DECISION_LOG.md` and orchestrator approval.

## Source Evidence

- **Myprogram**: `EDGE_FUNCTIONS.md`, `supabase/functions/shared/helpers.ts` — Auth pattern, error response format, role checking
- **Dovelite**: `app/api/` route structure — Next.js API route patterns, `requireProfile` auth guard, Supabase client usage
- **Adopted from Myprogram**: Error response model, role-based auth verification, status code conventions
- **Adopted from Dovelite**: Next.js app router API route structure, server-side auth guard pattern
- **Intentional divergences**: ai-fsm uses `/api/v1` prefix (neither source has versioned APIs); custom session auth instead of Supabase auth; `traceId` added to errors for observability; no edge functions — all logic in Next.js API routes

## Base Principles

- All routes under `/api/v1/`
- JSON request and response bodies
- All routes require authentication (except `/api/v1/auth/login`)
- Content-Type: `application/json`
- All responses include appropriate HTTP status codes

## Authentication

### POST `/api/v1/auth/login`
- Body: `{ email: string, password: string }`
- Response 200: `{ token: string, user: { id, email, full_name, role, account_id } }`
- Response 401: `{ error: { code: "INVALID_CREDENTIALS", message: string } }`
- Sets HTTP-only session cookie

### POST `/api/v1/auth/logout`
- Response 200: `{ message: "ok" }`
- Clears session

### GET `/api/v1/auth/me`
- Response 200: `{ id, email, full_name, role, account_id }`
- Response 401: Unauthorized

## Error Model

All errors follow this shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {},
    "traceId": "uuid"
  }
}
```

### Standard Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Request body failed validation |
| 400 | `INVALID_TRANSITION` | Status transition not allowed |
| 401 | `UNAUTHORIZED` | Missing or invalid session |
| 403 | `FORBIDDEN` | Insufficient role for this action |
| 404 | `NOT_FOUND` | Entity not found (or not in tenant scope) |
| 409 | `CONFLICT` | Duplicate or state conflict |
| 422 | `IMMUTABLE_ENTITY` | Entity is in an immutable state |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

## Standard List Parameters

All list endpoints accept:
- `?page=1&limit=20` — Pagination (default limit 20, max 100)
- `?sort=created_at&order=desc` — Sorting
- `?status=draft` — Status filter (where applicable)

Response shape for lists:
```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 42 }
}
```

## Resource Endpoints

### Clients

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/clients` | owner, admin, tech | List clients |
| POST | `/api/v1/clients` | owner, admin | Create client |
| GET | `/api/v1/clients/:id` | owner, admin, tech | Get client |
| PATCH | `/api/v1/clients/:id` | owner, admin | Update client |
| DELETE | `/api/v1/clients/:id` | owner | Delete client |

### Properties

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/clients/:clientId/properties` | owner, admin, tech | List properties for client |
| POST | `/api/v1/clients/:clientId/properties` | owner, admin | Create property |
| GET | `/api/v1/properties/:id` | owner, admin, tech | Get property |
| PATCH | `/api/v1/properties/:id` | owner, admin | Update property |
| DELETE | `/api/v1/properties/:id` | owner | Delete property |

### Jobs

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/jobs` | owner, admin, tech* | List jobs (*tech sees only assigned) |
| POST | `/api/v1/jobs` | owner, admin | Create job |
| GET | `/api/v1/jobs/:id` | owner, admin, tech* | Get job |
| PATCH | `/api/v1/jobs/:id` | owner, admin | Update job |
| POST | `/api/v1/jobs/:id/transition` | owner, admin | Transition job status |
| DELETE | `/api/v1/jobs/:id` | owner | Delete job (only draft) |

**Transition body**: `{ status: "<target_status>" }`

### Visits

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/jobs/:jobId/visits` | owner, admin, tech* | List visits for job |
| POST | `/api/v1/jobs/:jobId/visits` | owner, admin | Create visit |
| GET | `/api/v1/visits/:id` | owner, admin, tech* | Get visit |
| PATCH | `/api/v1/visits/:id` | owner, admin, tech* | Update visit (tech: notes only) |
| POST | `/api/v1/visits/:id/transition` | owner, admin, tech* | Transition visit status |

**Transition body**: `{ status: "<target_status>", tech_notes?: string }`

### Estimates

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/estimates` | owner, admin | List estimates |
| POST | `/api/v1/estimates` | owner, admin | Create estimate |
| GET | `/api/v1/estimates/:id` | owner, admin, tech | Get estimate |
| PATCH | `/api/v1/estimates/:id` | owner, admin | Update estimate (draft only) |
| POST | `/api/v1/estimates/:id/transition` | owner, admin | Transition estimate status |
| POST | `/api/v1/estimates/:id/convert` | owner, admin | Convert approved estimate to invoice |

**Line items**: Managed via estimate body — `{ ..., line_items: [...] }`. Line items are replaced atomically on update.

### Invoices

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/invoices` | owner, admin | List invoices |
| POST | `/api/v1/invoices` | owner, admin | Create invoice |
| GET | `/api/v1/invoices/:id` | owner, admin, tech | Get invoice |
| PATCH | `/api/v1/invoices/:id` | owner, admin | Update invoice (draft only) |
| POST | `/api/v1/invoices/:id/transition` | owner, admin | Transition invoice status |

### Payments

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/invoices/:invoiceId/payments` | owner, admin | List payments for invoice |
| POST | `/api/v1/invoices/:invoiceId/payments` | owner, admin | Record payment |
| DELETE | `/api/v1/payments/:id` | owner | Delete payment (recalculates invoice) |

### Automations

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/automations` | owner, admin | List automations |
| POST | `/api/v1/automations` | owner, admin | Create automation |
| PATCH | `/api/v1/automations/:id` | owner, admin | Update automation |
| DELETE | `/api/v1/automations/:id` | owner | Delete automation |

### Audit Log

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/audit-log` | owner, admin | List audit entries |

Query params: `?entity_type=job&entity_id=<uuid>` for filtering.

### Users (Account Management)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/users` | owner, admin | List users in account |
| POST | `/api/v1/users` | owner, admin | Invite/create user |
| PATCH | `/api/v1/users/:id` | owner, admin | Update user role/profile |
| DELETE | `/api/v1/users/:id` | owner | Remove user from account |

### Health

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/health` | none | Health check (no auth, no versioning) |

## Request Validation

All request bodies validated with Zod schemas from `@ai-fsm/domain`. Invalid requests return `VALIDATION_ERROR` with field-level details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "issues": [
        { "path": ["email"], "message": "Invalid email" }
      ]
    },
    "traceId": "..."
  }
}
```

## Tenant Scoping

All queries are automatically scoped to the authenticated user's `account_id`. A 404 is returned for any entity outside the user's tenant — never leak existence of cross-tenant data.
