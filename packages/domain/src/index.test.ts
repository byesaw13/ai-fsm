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
  estimateAdjustmentTypeSchema,
  estimateFinishExpectationSchema,
  estimateMinimumOverrideReasonSchema,
  estimatePricingReviewStatusSchema,
  estimateTripCountSchema,
  invoiceSchema,
  auditLogSchema,
  apiErrorSchema,
  jobTransitions,
  visitTransitions,
  estimateTransitions,
  invoiceTransitions,
  priceBookTierSchema,
  priceBookCategorySchema,
  priceBookItemSchema,
  priceFromMargin,
  PRICE_BOOK_TIER_MARGINS,
  MINIMUM_SERVICE_FEE_CENTS,
  MATERIAL_HANDLING_RATE,
  DEPOSIT_RATE,
  ESTIMATE_ADJUSTMENT_TYPES,
  ESTIMATE_FINISH_EXPECTATIONS,
  ESTIMATE_MINIMUM_OVERRIDE_REASONS,
  ESTIMATE_PRICING_REVIEW_STATUSES,
  ESTIMATE_TRIP_COUNT_OPTIONS,
  MEMBERSHIP_INCLUDED_LABOR_MINUTES_PER_VISIT,
  MEMBERSHIP_TIER_VISITS_PER_YEAR,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_ROUTING_ZONES,
  DOCUMENT_STANDARD_VERSION,
  ESTIMATE_DOCUMENT_SECTIONS,
  STANDARD_INVOICE_TERMS,
  VAULT_COMPLETENESS_TARGET_CATEGORIES,
  getVaultCollectionStep,
  computeVaultCompleteness,
  buildClientDocumentFilename,
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
      subtotal_cents: 0, tax_cents: 0, total_cents: 0, deposit_cents: 0, balance_cents: 0,
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

describe('Dovetails estimate guardrail standards', () => {
  it('keeps estimate guardrail enum schemas aligned with canonical constants', () => {
    expect(estimateTripCountSchema.options).toEqual(ESTIMATE_TRIP_COUNT_OPTIONS)
    expect(estimateFinishExpectationSchema.options).toEqual(ESTIMATE_FINISH_EXPECTATIONS)
    expect(estimateMinimumOverrideReasonSchema.options).toEqual(ESTIMATE_MINIMUM_OVERRIDE_REASONS)
    expect(estimateAdjustmentTypeSchema.options).toEqual(ESTIMATE_ADJUSTMENT_TYPES)
    expect(estimatePricingReviewStatusSchema.options).toEqual(ESTIMATE_PRICING_REVIEW_STATUSES)
  })

  it('accepts pricing guardrail fields on estimates', () => {
    expect(() => estimateSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID, status: 'draft',
      subtotal_cents: MINIMUM_SERVICE_FEE_CENTS,
      tax_cents: 0,
      total_cents: MINIMUM_SERVICE_FEE_CENTS,
      deposit_cents: 4500,
      balance_cents: 10500,
      created_by: UUID, created_at: NOW, updated_at: NOW,
      trip_count: 'multi_trip',
      requires_drying_or_curing: true,
      difficult_access: true,
      old_house_risk: true,
      coordination_required: true,
      finish_expectation: 'premium',
      travel_surcharge_cents: 2500,
      risk_adjustment_cents: 5000,
      minimum_service_override_reason: 'owner_approved',
      pricing_review_status: 'needs_review',
    })).not.toThrow()
  })
})

describe('invoiceSchema', () => {
  it('accepts a valid invoice', () => {
    expect(() => invoiceSchema.parse({
      id: UUID, account_id: UUID, client_id: UUID, status: 'draft',
      invoice_number: 'INV-001',
      subtotal_cents: 0, tax_cents: 0, total_cents: 0, paid_cents: 0, deposit_cents: 0, balance_cents: 0,
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

// ---------------------------------------------------------------------------
// Price Book
// ---------------------------------------------------------------------------

describe('priceBookTierSchema', () => {
  it('accepts valid tiers', () => {
    expect(priceBookTierSchema.parse('core')).toBe('core')
    expect(priceBookTierSchema.parse('standard')).toBe('standard')
    expect(priceBookTierSchema.parse('specialty')).toBe('specialty')
  })
  it('rejects invalid tiers', () => {
    expect(() => priceBookTierSchema.parse('premium')).toThrow()
  })
})

describe('priceBookCategorySchema', () => {
  it('accepts valid categories', () => {
    expect(priceBookCategorySchema.parse('general_repairs')).toBe('general_repairs')
    expect(priceBookCategorySchema.parse('plumbing')).toBe('plumbing')
    expect(priceBookCategorySchema.parse('painting_finishes')).toBe('painting_finishes')
  })
  it('rejects invalid categories', () => {
    expect(() => priceBookCategorySchema.parse('roofing')).toThrow()
  })
})

describe('priceBookItemSchema', () => {
  it('accepts a valid price book item', () => {
    expect(() => priceBookItemSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      code: '1001',
      name: 'Drywall patch',
      category: 'general_repairs',
      tier: 'core',
      price_min_cents: 15000,
      price_max_cents: 17500,
      description: 'Small patch',
      notes: null,
      default_labor_hours: 1,
      requires_materials: true,
      upsell_codes: [],
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    })).not.toThrow()
  })
  it('accepts open-ended pricing (null price_max_cents)', () => {
    expect(() => priceBookItemSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      code: '9001',
      name: 'Specialty project',
      category: 'specialty_expansion',
      tier: 'specialty',
      price_min_cents: 49500,
      price_max_cents: null,
      description: null,
      notes: 'Custom work',
      default_labor_hours: null,
      requires_materials: false,
      upsell_codes: [],
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    })).not.toThrow()
  })
})

describe('priceFromMargin', () => {
  it('calculates price from cost and margin correctly', () => {
    // Cost $120, margin 25% => Price = $120 / (1 - 0.25) = $160
    expect(priceFromMargin(12000, 0.25)).toBe(16000)
    // Cost $200, margin 30% => Price = $200 / 0.70 = $286
    expect(priceFromMargin(20000, 0.30)).toBe(28571)
    // Cost $100, margin 0% => Price = $100
    expect(priceFromMargin(10000, 0)).toBe(10000)
  })
  it('handles edge case of margin >= 1', () => {
    expect(priceFromMargin(5000, 1)).toBe(5000)
    expect(priceFromMargin(5000, 1.5)).toBe(5000)
  })
})

describe('PRICE_BOOK_TIER_MARGINS', () => {
  it('has margins for all three tiers', () => {
    expect(PRICE_BOOK_TIER_MARGINS.core).toEqual({ min: 0.25, max: 0.35 })
    expect(PRICE_BOOK_TIER_MARGINS.standard).toEqual({ min: 0.20, max: 0.30 })
    expect(PRICE_BOOK_TIER_MARGINS.specialty).toEqual({ min: 0.15, max: 0.25 })
  })
})

describe('Dovetails standards', () => {
  it('exposes canonical pricing standards', () => {
    expect(MINIMUM_SERVICE_FEE_CENTS).toBe(18500)
    expect(MATERIAL_HANDLING_RATE).toBe(0.15)
    expect(DEPOSIT_RATE).toBe(0.30)
  })

  it('exposes canonical membership tier defaults', () => {
    expect(MEMBERSHIP_TIERS).toEqual(['essential', 'plus', 'premier'])
    expect(MEMBERSHIP_TIER_VISITS_PER_YEAR).toEqual({
      essential: 1,
      plus: 2,
      premier: 4,
    })
    expect(MEMBERSHIP_INCLUDED_LABOR_MINUTES_PER_VISIT).toBe(60)
    expect(MEMBERSHIP_ROUTING_ZONES).toEqual(['core', 'extended', 'out_of_area'])
  })

  it('exposes versioned document standards', () => {
    expect(DOCUMENT_STANDARD_VERSION).toBe('2026.05')
    expect(STANDARD_INVOICE_TERMS).toContain('not internal labor hours')
    expect(Object.keys(ESTIMATE_DOCUMENT_SECTIONS)).toEqual([
      'preparation',
      'repair_install_work',
      'finish_work',
      'materials',
      'exclusions',
      'client_responsibilities',
    ])
  })

  it('scores vault completeness from core category coverage', () => {
    expect(VAULT_COMPLETENESS_TARGET_CATEGORIES).toEqual([
      'mechanical',
      'appliance',
      'filter',
      'paint_finish',
      'monitor',
      'vendor',
    ])

    expect(computeVaultCompleteness([
      { category: 'mechanical' },
      { category: 'mechanical' },
      { category: 'filter' },
      { category: 'other' },
    ])).toEqual({
      percent: 33,
      coveredCount: 2,
      totalCount: 6,
      coveredCategories: ['mechanical', 'filter'],
      missingCategories: ['appliance', 'paint_finish', 'monitor', 'vendor'],
    })

    expect(
      computeVaultCompleteness(
        VAULT_COMPLETENESS_TARGET_CATEGORIES.map((category) => ({ category }))
      ).percent
    ).toBe(100)
  })

  it('builds staged vault collection prompts from visit number', () => {
    expect(getVaultCollectionStep({
      annualVisitCount: 4,
      visitNumber: 1,
      recordedCategories: [],
    })).toMatchObject({
      visitNumber: 1,
      annualVisitCount: 4,
      cycleVisitNumber: 1,
      cycleYear: 1,
      focusCategories: ['mechanical', 'filter'],
      missingFocusCategories: ['mechanical', 'filter'],
    })

    expect(getVaultCollectionStep({
      annualVisitCount: 2,
      visitNumber: 2,
      recordedCategories: ['mechanical', 'appliance'],
    })).toMatchObject({
      cycleVisitNumber: 2,
      cycleYear: 1,
      focusCategories: ['paint_finish', 'monitor', 'vendor'],
      missingFocusCategories: ['paint_finish', 'monitor', 'vendor'],
      missingCoreCategories: ['filter', 'paint_finish', 'monitor', 'vendor'],
    })

    expect(getVaultCollectionStep({
      annualVisitCount: 4,
      visitNumber: 5,
      recordedCategories: ['mechanical', 'filter'],
    })).toMatchObject({
      cycleVisitNumber: 1,
      cycleYear: 2,
      completedFocusCategories: ['mechanical', 'filter'],
      missingFocusCategories: [],
    })
  })

  it('builds client document filenames across document types', () => {
    expect(buildClientDocumentFilename({
      date: '2026-05-06T12:00:00Z',
      clientName: 'Ada Lovelace',
      jobType: 'membership plan',
      documentType: 'membership_plan',
      status: 'final',
    })).toBe('2026-05-06_Lovelace_MembershipPlan_MembershipPlan_Final')
  })
})
