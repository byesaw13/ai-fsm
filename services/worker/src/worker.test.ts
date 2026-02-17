import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Worker automation poll resilience tests
//
// The worker's core loop queries automation due counts and logs the result.
// Tests verify: (a) successful poll logs without throwing, (b) DB error is
// caught and does not propagate (interval keeps running).
//
// We test the polling logic in isolation without actually connecting to PG.
// ---------------------------------------------------------------------------

async function runPollIteration(
  query: () => Promise<{ rows: { due_count: number }[] }>
): Promise<void> {
  try {
    const { rows } = await query()
    const count = rows[0]?.due_count ?? 0
    console.log('automation poll', { due: count, at: new Date().toISOString() })
  } catch (error) {
    console.error('worker poll failed', error)
    // error is swallowed — interval continues
  }
}

describe('worker automation poll', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('logs due count on successful query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ due_count: 3 }] })
    await runPollIteration(query)
    expect(console.log).toHaveBeenCalledWith(
      'automation poll',
      expect.objectContaining({ due: 3 })
    )
    expect(console.error).not.toHaveBeenCalled()
  })

  it('logs zero when no automations are due', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ due_count: 0 }] })
    await runPollIteration(query)
    expect(console.log).toHaveBeenCalledWith(
      'automation poll',
      expect.objectContaining({ due: 0 })
    )
  })

  it('handles empty rows gracefully (defaults to 0)', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await runPollIteration(query)
    expect(console.log).toHaveBeenCalledWith(
      'automation poll',
      expect.objectContaining({ due: 0 })
    )
    expect(console.error).not.toHaveBeenCalled()
  })

  it('swallows DB error and does not rethrow', async () => {
    const query = vi.fn().mockRejectedValue(new Error('connection lost'))
    // Must not throw — interval should keep running
    await expect(runPollIteration(query)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      'worker poll failed',
      expect.any(Error)
    )
    expect(console.log).not.toHaveBeenCalled()
  })
})
