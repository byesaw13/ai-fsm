import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock next/headers before importing middleware (Next.js server functions need this)
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn() })),
}))

// Mock the session module
vi.mock('../session', () => ({
  getSession: vi.fn(),
}))

import { requireAuth, requireRole, withAuth, withRole } from '../middleware'
import { getSession } from '../session'

const mockGetSession = vi.mocked(getSession)

const FAKE_SESSION = {
  userId: '00000000-0000-4000-8000-000000000001',
  accountId: '00000000-0000-4000-8000-000000000002',
  role: 'owner' as const,
}

function makeRequest(url = 'http://localhost/api/v1/test'): NextRequest {
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  it('returns success:false with 401 when session is missing', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await requireAuth(makeRequest())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body.error.code).toBe('UNAUTHORIZED')
    }
  })

  it('returns success:true with session when authenticated', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION)
    const result = await requireAuth(makeRequest())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.session.userId).toBe(FAKE_SESSION.userId)
      expect(result.session.role).toBe('owner')
    }
  })
})

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe('requireRole', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await requireRole(makeRequest(), ['owner'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(401)
    }
  })

  it('returns 403 when role is insufficient', async () => {
    mockGetSession.mockResolvedValue({ ...FAKE_SESSION, role: 'tech' as const })
    const result = await requireRole(makeRequest(), ['owner', 'admin'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(403)
      const body = await result.response.json()
      expect(body.error.code).toBe('FORBIDDEN')
    }
  })

  it('passes through when role is allowed', async () => {
    mockGetSession.mockResolvedValue({ ...FAKE_SESSION, role: 'admin' as const })
    const result = await requireRole(makeRequest(), ['owner', 'admin'])
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// withAuth HOF
// ---------------------------------------------------------------------------

describe('withAuth', () => {
  it('calls handler with session when authenticated', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION)
    const handler = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const wrapped = withAuth(handler)
    const response = await wrapped(makeRequest())
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][1]).toMatchObject({ role: 'owner' })
    expect(response.status).toBe(200)
  })

  it('returns 401 without calling handler when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const handler = vi.fn()
    const wrapped = withAuth(handler)
    const response = await wrapped(makeRequest())
    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// withRole HOF
// ---------------------------------------------------------------------------

describe('withRole', () => {
  it('calls handler when role is allowed', async () => {
    mockGetSession.mockResolvedValue({ ...FAKE_SESSION, role: 'admin' as const })
    const handler = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const wrapped = withRole(['owner', 'admin'], handler)
    const response = await wrapped(makeRequest())
    expect(handler).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
  })

  it('returns 403 when role is not allowed', async () => {
    mockGetSession.mockResolvedValue({ ...FAKE_SESSION, role: 'tech' as const })
    const handler = vi.fn()
    const wrapped = withRole(['owner', 'admin'], handler)
    const response = await wrapped(makeRequest())
    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
  })
})
