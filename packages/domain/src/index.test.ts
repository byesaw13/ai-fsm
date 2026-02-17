import { describe, it, expect } from 'vitest'
import {
  roleSchema,
  jobStatusSchema,
  visitStatusSchema,
  estimateStatusSchema,
  invoiceStatusSchema,
  auditActionSchema,
  paymentMethodSchema,
  accountSchema,
  userSchema,
  jobSchema,
  visitSchema,
  estimateSchema,
  invoiceSchema,
  auditLogSchema,
  apiErrorSchema,
  jobTransitions,
  visitTransitions,
  estimateTransitions,
  invoiceTransitions,
} from './index'

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

describe('roleSchema', () => {
  it('accepts valid roles', () => {
    expect(roleSchema.parse('owner')).toBe('owner')
    expect(roleSchema.parse('admin')).toBe('admin')
    expect(roleSchema.parse('tech')).toBe('tech')
  })
  it('rejects invalid role', () => {
    expect(() => roleSchema.parse('superadmin')).toThrow()
  })
})

describe('jobStatusSchema', () => {
  it('accepts all defined statuses', () => {
    for (const s of ['draft','quoted','scheduled','in_progress','completed','invoiced','cancelled']) {
      expect(jobStatusSchema.parse(s)).toBe(s)
    }
  })
  it('rejects unknown status', () => {
    expect(() => jobStatusSchema.parse('invalid_status')).toThrow()
  })
})

describe('visitStatusSchema', () => {
  it('accepts all defined statuses', () => {
    for (const s of ['scheduled','arrived','in_progress','completed','cancelled']) {
      expect(visitStatusSchema.parse(s)).toBe(s)
    }
  })
  it('rejects unknown status', () => {
    expect(() => visitStatusSchema.parse('pending')).toThrow()
  })
})

describe('estimateStatusSchema', () => {
  it('accepts all defined statuses', () => {
    for (const s of ['draft','sent','approved','declined','expired']) {
      expect(estimateStatusSchema.parse(s)).toBe(s)
    }
  })
})

describe('invoiceStatusSchema', () => {
  it('accepts all defined statuses', () => {
    for (const s of ['draft','sent','partial','paid','overdue','void']) {
      expect(invoiceStatusSchema.parse(s)).toBe(s)
    }
  })
})

describe('auditActionSchema', () => {
  it('accepts insert/update/delete', () => {
    for (const a of ['insert','update','delete']) {
      expect(auditActionSchema.parse(a)).toBe(a)
    }
  })
  it('rejects unknown action', () => {
    expect(() => auditActionSchema.parse('upsert')).toThrow()
  })
})

describe('paymentMethodSchema', () => {
  it('accepts all defined methods', () => {
    for (const m of ['cash','check','card','transfer','other']) {
      expect(paymentMethodSchema.parse(m)).toBe(m)
    }
  })
})

// ---------------------------------------------------------------------------
// Status transition maps
// ---------------------------------------------------------------------------

describe('jobTransitions', () => {
  it('draft can transition to quoted and scheduled', () => {
    expect(jobTransitions.draft).toContain('quoted')
    expect(jobTransitions.draft).toContain('scheduled')
  })
  it('invoiced is terminal (empty transitions)', () => {
    expect(jobTransitions.invoiced).toHaveLength(0)
  })
  it('draft→invoiced is not a direct transition', () => {
    expect(jobTransitions.draft).not.toContain('invoiced')
  })
  it('cancelled can revert to draft', () => {
    expect(jobTransitions.cancelled).toContain('draft')
  })
})

describe('visitTransitions', () => {
  it('scheduled can go to arrived or cancelled', () => {
    expect(visitTransitions.scheduled).toContain('arrived')
    expect(visitTransitions.scheduled).toContain('cancelled')
  })
  it('completed is terminal', () => {
    expect(visitTransitions.completed).toHaveLength(0)
  })
  it('in_progress cannot be cancelled directly', () => {
    expect(visitTransitions.in_progress).not.toContain('cancelled')
  })
})

describe('estimateTransitions', () => {
  it('draft can only go to sent', () => {
    expect(estimateTransitions.draft).toEqual(['sent'])
  })
  it('approved is terminal', () => {
    expect(estimateTransitions.approved).toHaveLength(0)
  })
})

describe('invoiceTransitions', () => {
  it('draft can go to sent or void', () => {
    expect(invoiceTransitions.draft).toContain('sent')
    expect(invoiceTransitions.draft).toContain('void')
  })
  it('paid is terminal', () => {
    expect(invoiceTransitions.paid).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Entity schemas — required field validation
// ---------------------------------------------------------------------------

const UUID = '00000000-0000-4000-8000-000000000001'
const NOW = new Date().toISOString()

describe('accountSchema', () => {
  it('accepts a valid account', () => {
    expect(() => accountSchema.parse({ id: UUID, name: 'Acme', settings: {}, created_at: NOW, updated_at: NOW })).not.toThrow()
  })
  it('rejects missing name', () => {
    expect(() => accountSchema.parse({ id: UUID, settings: {}, created_at: NOW, updated_at: NOW })).toThrow()
  })
})

describe('userSchema', () => {
  it('accepts a valid user', () => {
    expect(() => userSchema.parse({
      id: UUID, account_id: UUID, email: 'a@b.com', full_name: 'A B',
      password_hash: 'hash', role: 'tech', created_at: NOW, updated_at: NOW,
    })).not.toThrow()
  })
  it('rejects invalid role', () => {
    expect(() => userSchema.parse({
      id: UUID, account_id: UUID, email: 'a@b.com', full_name: 'A B',
      password_hash: 'hash', role: 'god', created_at: NOW, updated_at: NOW,
    })).toThrow()
  })
})

describe('jobSchema', () => {
  it('accepts a valid job', () => {
    expect(() => jobSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID, title: 'Lawn care',
      status: 'draft', priority: 0, created_by: UUID, created_at: NOW, updated_at: NOW,
    })).not.toThrow()
  })
  it('rejects missing title', () => {
    expect(() => jobSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID,
      status: 'draft', priority: 0, created_by: UUID, created_at: NOW, updated_at: NOW,
    })).toThrow()
  })
})

describe('visitSchema', () => {
  it('accepts a valid visit', () => {
    expect(() => visitSchema.parse({
      id: UUID, account_id: UUID, job_id: UUID, status: 'scheduled',
      scheduled_start: NOW, scheduled_end: NOW, created_at: NOW, updated_at: NOW,
    })).not.toThrow()
  })
})

describe('estimateSchema', () => {
  it('accepts a valid estimate', () => {
    expect(() => estimateSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID, status: 'draft',
      subtotal_cents: 0, tax_cents: 0, total_cents: 0,
      created_by: UUID, created_at: NOW, updated_at: NOW,
    })).not.toThrow()
  })
  it('rejects negative subtotal_cents', () => {
    expect(() => estimateSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID, status: 'draft',
      subtotal_cents: -1, tax_cents: 0, total_cents: 0,
      created_by: UUID, created_at: NOW, updated_at: NOW,
    })).toThrow()
  })
})

describe('invoiceSchema', () => {
  it('accepts a valid invoice', () => {
    expect(() => invoiceSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID, status: 'draft',
      invoice_number: 'INV-001',
      subtotal_cents: 0, tax_cents: 0, total_cents: 0, paid_cents: 0,
      created_by: UUID, created_at: NOW, updated_at: NOW,
    })).not.toThrow()
  })
  it('rejects missing invoice_number', () => {
    expect(() => invoiceSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID, status: 'draft',
      subtotal_cents: 0, tax_cents: 0, total_cents: 0, paid_cents: 0,
      created_by: UUID, created_at: NOW, updated_at: NOW,
    })).toThrow()
  })
})

describe('auditLogSchema', () => {
  it('accepts a valid audit log entry', () => {
    expect(() => auditLogSchema.parse({
      id: UUID, account_id: UUID, entity_type: 'job', entity_id: UUID,
      action: 'insert', actor_id: UUID, created_at: NOW,
    })).not.toThrow()
  })
  it('rejects invalid action', () => {
    expect(() => auditLogSchema.parse({
      id: UUID, account_id: UUID, entity_type: 'job', entity_id: UUID,
      action: 'drop', actor_id: UUID, created_at: NOW,
    })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// API error model
// ---------------------------------------------------------------------------

describe('apiErrorSchema', () => {
  it('accepts a valid error with UUID traceId', () => {
    expect(() => apiErrorSchema.parse({
      error: { code: 'NOT_FOUND', message: 'not found', traceId: UUID },
    })).not.toThrow()
  })
  it('rejects missing traceId', () => {
    expect(() => apiErrorSchema.parse({
      error: { code: 'NOT_FOUND', message: 'not found' },
    })).toThrow()
  })
  it('rejects non-UUID traceId', () => {
    expect(() => apiErrorSchema.parse({
      error: { code: 'NOT_FOUND', message: 'not found', traceId: 'not-a-uuid' },
    })).toThrow()
  })
})
