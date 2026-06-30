import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Worker smoke tests
//
// index.ts has a top-level DATABASE_URL guard that throws at import time,
// making it untestable as a unit in isolation. Full poll iteration coverage
// is an integration test concern. These tests verify the automation registry
// and runner exports instead.
// ---------------------------------------------------------------------------

describe('worker automation registry', () => {
  it('registry exports 12 dispatched automation definitions', async () => {
    const mod = await import('./automations/registry.js')
    expect(mod.AUTOMATION_REGISTRY).toHaveLength(12)
    expect(mod.DISPATCHED_AUTOMATION_TYPES).toHaveLength(12)
    expect(mod.DISPATCHED_AUTOMATION_TYPES).not.toContain('membership_renewal_nudge')
  })

  it('runner exports automation dispatch helpers', async () => {
    const mod = await import('./automations/runner.js')
    expect(typeof mod.runAutomationType).toBe('function')
    expect(typeof mod.runAllDueAutomations).toBe('function')
  })

  it('visit-reminder exports process helpers without removed wrappers', async () => {
    const mod = await import('./visit-reminder.js')
    expect(typeof mod.findDueReminders).toBe('function')
    expect(typeof mod.findEligibleVisits).toBe('function')
    expect(typeof mod.emitVisitReminder).toBe('function')
    expect(typeof mod.processVisitReminder).toBe('function')
    expect(mod).not.toHaveProperty('markAutomationRun')
    expect(mod).not.toHaveProperty('runVisitReminders')
  })
})