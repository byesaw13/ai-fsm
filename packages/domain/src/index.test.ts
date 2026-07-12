import { describe, it, expect } from 'vitest'
import {
  roleSchema,
  jobStatusSchema,
  visitStatusSchema,
  estimateStatusSchema,
  invoiceStatusSchema,
  auditActionSchema,
  paymentMethodSchema,
  paymentTypeSchema,
  paymentStatusSchema,
  estimateAdjustmentTypeSchema,
  estimateFinishExpectationSchema,
  estimateMinimumOverrideReasonSchema,
  estimatePricingReviewStatusSchema,
  estimateTripCountSchema,
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
  MATERIAL_HANDLING_CLIENT_RATE,
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
    for (const m of ['square','venmo','cash','check','zelle','ach','card','transfer','other']) {
      expect(paymentMethodSchema.parse(m)).toBe(m)
    }
  })
  it('rejects unknown methods', () => {
    expect(paymentMethodSchema.safeParse('paypal').success).toBe(false)
  })
})

describe('paymentTypeSchema', () => {
  it('accepts all defined types', () => {
    for (const t of ['deposit','progress','final','refund','adjustment']) {
      expect(paymentTypeSchema.parse(t)).toBe(t)
    }
  })
  it('rejects unknown types', () => {
    expect(paymentTypeSchema.safeParse('partial').success).toBe(false)
  })
})

describe('paymentStatusSchema', () => {
  it('accepts all defined statuses', () => {
    for (const s of ['pending','paid','failed','refunded','cancelled']) {
      expect(paymentStatusSchema.parse(s)).toBe(s)
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
  it('in_progress can be cancelled (to dismiss missed/abandoned visits)', () => {
    expect(visitTransitions.in_progress).toContain('cancelled')
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

describe('Dovetails estimate guardrail standards', () => {
  it('keeps estimate guardrail enum schemas aligned with canonical constants', () => {
    expect(estimateTripCountSchema.options).toEqual(ESTIMATE_TRIP_COUNT_OPTIONS)
    expect(estimateFinishExpectationSchema.options).toEqual(ESTIMATE_FINISH_EXPECTATIONS)
    expect(estimateMinimumOverrideReasonSchema.options).toEqual(ESTIMATE_MINIMUM_OVERRIDE_REASONS)
    expect(estimateAdjustmentTypeSchema.options).toEqual(ESTIMATE_ADJUSTMENT_TYPES)
    expect(estimatePricingReviewStatusSchema.options).toEqual(ESTIMATE_PRICING_REVIEW_STATUSES)
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
    expect(MATERIAL_HANDLING_CLIENT_RATE).toBe(0.15)
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
    expect(STANDARD_INVOICE_TERMS).toContain('due upon completion')
    expect(Object.keys(ESTIMATE_DOCUMENT_SECTIONS)).toEqual([
      'preparation',
      'repair_install_work',
      'finish_work',
      'materials',
      'exclusions',
      'client_responsibilities',
    ])
  })

  it('dueDateUponCompletion uses America/New_York calendar day', async () => {
    const { dueDateUponCompletion } = await import('./dovetails')
    // 2026-07-09 15:40 UTC is still July 9 afternoon in US Eastern (EDT = UTC-4)
    expect(dueDateUponCompletion('2026-07-09T15:40:56.000Z')).toBe('2026-07-09T00:00:00.000Z')
    // Late evening UTC that is still evening Eastern on the 9th
    expect(dueDateUponCompletion('2026-07-10T02:00:00.000Z')).toBe('2026-07-09T00:00:00.000Z')
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
