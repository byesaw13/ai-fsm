import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Worker smoke tests
//
// index.ts has a top-level DATABASE_URL guard that throws at import time,
// making it untestable as a unit in isolation. Full poll iteration coverage
// is an integration test concern. These tests verify the module's helper
// exports and pure-function behaviour instead.
// ---------------------------------------------------------------------------

describe('worker helper exports', () => {
  it('visit-reminder exports expected public functions', async () => {
    const mod = await import('./visit-reminder.js')
    expect(typeof mod.findDueReminders).toBe('function')
    expect(typeof mod.findEligibleVisits).toBe('function')
    expect(typeof mod.emitVisitReminder).toBe('function')
    expect(typeof mod.markAutomationRun).toBe('function')
    expect(typeof mod.processVisitReminder).toBe('function')
    expect(typeof mod.runVisitReminders).toBe('function')
  })
})
