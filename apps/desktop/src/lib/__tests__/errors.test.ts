import { describe, it, expect } from 'vitest'
import { mapError, ErrorCode, AnvilError } from '@/lib/errors'

describe('mapError', () => {
  it('maps TypeError (fetch failed) to OFFLINE', () => {
    const err = new TypeError('Failed to fetch')
    expect(mapError(err).code).toBe(ErrorCode.OFFLINE)
  })

  it('maps Response 401 to AUTH_EXPIRED', () => {
    const res = new Response(null, { status: 401 })
    expect(mapError(res).code).toBe(ErrorCode.AUTH_EXPIRED)
  })

  it('maps Response 429 to RATE_LIMITED', () => {
    const res = new Response(null, { status: 429 })
    expect(mapError(res).code).toBe(ErrorCode.RATE_LIMITED)
  })

  it('maps Response 503 to API_UNREACHABLE', () => {
    const res = new Response(null, { status: 503 })
    expect(mapError(res).code).toBe(ErrorCode.SERVER_ERROR)
  })

  it('maps Response 404 to NOT_FOUND', () => {
    const res = new Response(null, { status: 404 })
    expect(mapError(res).code).toBe(ErrorCode.NOT_FOUND)
  })

  it('maps Response 500 to SERVER_ERROR', () => {
    const res = new Response(null, { status: 500 })
    expect(mapError(res).code).toBe(ErrorCode.SERVER_ERROR)
  })

  it('maps unknown to UNKNOWN', () => {
    expect(mapError('something random').code).toBe(ErrorCode.UNKNOWN)
    expect(mapError(42).code).toBe(ErrorCode.UNKNOWN)
    expect(mapError(null).code).toBe(ErrorCode.UNKNOWN)
  })

  it('returns AnvilError as-is', () => {
    const original = new AnvilError(ErrorCode.NOT_FOUND)
    expect(mapError(original)).toBe(original)
  })
})
